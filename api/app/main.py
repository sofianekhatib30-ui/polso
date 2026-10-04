"""API di Polso.

Scrittura (protetta da token):  POST /checks, /domains, /heartbeats, /ping/{slug}, /alerts/test, /probe
Lettura (pubblica):             GET /sites, /sites/{id}, /sites/{id}/series, /sites/{id}/transitions,
                                /incidents, /uptime/daily, /clients, /heartbeats, /report,
                                /badge/{id}.svg, /ssl/expiring, /health
"""

from __future__ import annotations

import logging
import secrets
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, date, datetime
from html import escape
from typing import Annotated, Any
from urllib.parse import urljoin, urlparse
from zoneinfo import ZoneInfo

from fastapi import Depends, FastAPI, Header, HTTPException, Query, Response
from fastapi.responses import RedirectResponse

from . import alerts, db, expiry, probe
from .incidents import CheckState, decide
from .models import CheckIn, DomainIn, HeartbeatIn, IngestResult, ProbeIn, slugify
from .settings import settings

log = logging.getLogger("polso")
ROME = ZoneInfo("Europe/Rome")


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    """All'avvio crea le tabelle se mancano: lo schema usa IF NOT EXISTS, quindi rieseguirlo non fa danni.
    Così un database nuovo (Neon, Supabase, locale) è pronto senza passaggi manuali."""
    try:
        db.ensure_schema()
    except Exception:  # database non raggiungibile: l'API parte lo stesso, /health dirà 503
        log.exception("Creazione dello schema non riuscita")
    yield


app = FastAPI(
    title="Polso API",
    description="Monitor dei siti: controlli, uptime, incidenti.",
    version="1.0.0",
    lifespan=lifespan,
)


def _check_token(given: str | None) -> None:
    if not settings.ingest_token:
        # senza token configurato la scrittura resta chiusa, mai aperta a tutti
        raise HTTPException(503, "Scrittura disattivata: POLSO_INGEST_TOKEN non impostato")
    # compare_digest confronta in tempo costante: non rivela quanti caratteri sono giusti
    if not given or not secrets.compare_digest(given.encode(), settings.ingest_token.encode()):
        raise HTTPException(401, "Token mancante o non valido")


def require_token(authorization: Annotated[str | None, Header()] = None) -> None:
    """Accetta solo richieste con l'header `Authorization: Bearer <token>` giusto."""
    given = authorization[7:].strip() if authorization and authorization.startswith("Bearer ") else None
    _check_token(given)


_TIMING_FIELDS = ("redirect_ms", "wait_ms", "download_ms", "size_bytes", "redirects", "origin")


def _default_name(url: str) -> str:
    return urlparse(url).hostname or url


def _icon_url(check: CheckIn) -> str | None:
    """Icona del sito: indirizzo assoluto, oppure l'immagine incorporata (data:image/...) così com'è.
    Solo se il sito ha risposto; senza icona dichiarata si prova /favicon.ico. Mai javascript:."""
    if not check.is_up:
        return None
    if check.icon_href and check.icon_href.lower().startswith("data:image/"):
        return check.icon_href  # icona incorporata: già pronta per <img src>
    base = check.final_url if check.final_url and check.final_url.startswith(("http://", "https://")) else check.url
    icon = urljoin(base + ("" if urlparse(base).path else "/"), check.icon_href or "/favicon.ico")
    return icon if urlparse(icon).scheme in ("http", "https") and len(icon) <= 1000 else None


@app.get("/", include_in_schema=False)
def root() -> RedirectResponse:
    # l'indirizzo principale porta alla documentazione interattiva
    return RedirectResponse("/docs")


@app.get("/health")
def health(response: Response) -> dict[str, Any]:
    try:
        with db.connect() as conn:
            db.fetch_one(conn, "health")
    except Exception:
        log.exception("Database non raggiungibile")
        response.status_code = 503
        return {"ok": False, "database": False}
    return {"ok": True, "database": True}


@app.post("/checks", dependencies=[Depends(require_token)])
def ingest(checks: list[CheckIn], sync: bool = False) -> IngestResult:
    """Salva i controlli. Con `?sync=true` la lista inviata è quella completa:
    i siti che non ci sono più vengono disattivati e spariscono dalla dashboard (lo storico resta)."""
    if not checks:
        raise HTTPException(422, "Nessun controllo da salvare")
    if len(checks) > 200:
        raise HTTPException(413, "Massimo 200 controlli per richiesta")

    opened = resolved = 0
    to_alert: list[str] = []
    now = datetime.now(UTC)

    # Tutto in una transazione: o si salva tutto, o niente.
    with db.connect() as conn:
        for check in checks:
            site = db.fetch_one(
                conn,
                "upsert_site",
                {
                    "url": check.url,
                    "name": check.name or _default_name(check.url),
                    "given_name": check.name,
                    "client_name": check.client,
                    "client_slug": slugify(check.client) if check.client else None,
                    "keyword": check.keyword,
                    "icon_url": _icon_url(check),
                },
            )
            assert site is not None
            site_id = site["id"]
            db.fetch_one(
                conn,
                "insert_check",
                {
                    "site_id": site_id,
                    "checked_at": check.checked_at or now,
                    "is_up": check.is_up,
                    "status_code": check.status_code,
                    "response_ms": check.response_ms,
                    "ssl_expires_at": check.ssl_expires_at,
                    "error": check.error,
                    "security_headers": check.security_headers,
                    **(check.timing.model_dump() if check.timing else dict.fromkeys(_TIMING_FIELDS)),
                },
            )

            open_incident = db.fetch_one(conn, "open_incident", {"site_id": site_id})
            recent = [
                CheckState(r["checked_at"], r["is_up"], r["error"])
                for r in db.fetch_all(conn, "recent_checks", {"site_id": site_id, "limit": settings.down_threshold})
            ]
            decision = decide(recent, open_incident is not None, settings.down_threshold)

            if decision.action == "open":
                if db.fetch_one(
                    conn, "open_new_incident", {"site_id": site_id, "started_at": decision.at, "cause": decision.cause}
                ):
                    opened += 1
                    nome = check.name or _default_name(check.url)
                    causa = decision.cause or "nessuna risposta"
                    to_alert.append(f"🔴 *{nome}* non risponde: {causa}\n{check.url}")
            elif (
                decision.action == "close"
                and open_incident
                and db.fetch_one(conn, "resolve_incident", {"id": open_incident["id"], "resolved_at": decision.at})
            ):
                resolved += 1
                to_alert.append(f"🟢 *{check.name or _default_name(check.url)}* è di nuovo online\n{check.url}")

        deactivated = 0
        if sync:
            deactivated = len(db.fetch_all(conn, "deactivate_missing", {"urls": [c.url for c in checks]}))

        # il checker passa ogni 15 minuti: è il momento giusto per vedere se qualche attività è in ritardo
        for hb in db.fetch_all(conn, "heartbeats_mark_late"):
            to_alert.append(_late_text(hb))
        to_alert += _expiry_alerts(conn)

    # Gli avvisi partono solo DOPO il commit: mai avvisare di qualcosa che non è stato salvato.
    for text in to_alert:
        alerts.send(text)

    return IngestResult(
        saved=len(checks), incidents_opened=opened, incidents_resolved=resolved, sites_deactivated=deactivated
    )


@app.get("/sites")
def list_sites(client: str | None = None) -> list[dict[str, Any]]:
    """Tutti i siti attivi, oppure solo quelli di un cliente (`?client=slug`)."""
    with db.connect() as conn:
        return db.fetch_all(conn, "sites_overview", {"client": client})


@app.get("/sites/{site_id}")
def site_detail(site_id: int) -> dict[str, Any]:
    with db.connect() as conn:
        row = db.fetch_one(conn, "site_detail", {"site_id": site_id})
    if row is None:
        raise HTTPException(404, "Sito non trovato")
    return row


def _require_active(conn: Any, site_id: int) -> None:
    """Un sito tolto dalla lista non si vede più dall'API pubblica, nemmeno conoscendo il suo id."""
    if db.fetch_one(conn, "site_active", {"site_id": site_id}) is None:
        raise HTTPException(404, "Sito non trovato")


@app.get("/sites/{site_id}/series")
def site_series(site_id: int, hours: Annotated[int, Query(ge=1, le=24 * 30)] = 72) -> list[dict[str, Any]]:
    with db.connect() as conn:
        _require_active(conn, site_id)
        return db.fetch_all(conn, "response_series", {"site_id": site_id, "hours": hours})


@app.get("/sites/{site_id}/timing")
def site_timing(site_id: int) -> dict[str, Any]:
    """Dove va il tempo di risposta: redirect, attesa del server e download (mediana 24 h e ultimo controllo)."""
    with db.connect() as conn:
        _require_active(conn, site_id)
        row = db.fetch_one(conn, "timing_breakdown", {"site_id": site_id})
    return row or {"samples": 0}


@app.get("/sites/{site_id}/transitions")
def site_transitions(site_id: int, limit: Annotated[int, Query(ge=1, le=200)] = 20) -> list[dict[str, Any]]:
    with db.connect() as conn:
        _require_active(conn, site_id)
        return db.fetch_all(conn, "transitions", {"site_id": site_id, "limit": limit})


@app.get("/incidents")
def list_incidents(
    site_id: int | None = None, client: str | None = None, limit: Annotated[int, Query(ge=1, le=200)] = 50
) -> list[dict[str, Any]]:
    with db.connect() as conn:
        if site_id is not None:
            _require_active(conn, site_id)
        return db.fetch_all(conn, "incidents_list", {"site_id": site_id, "client": client, "limit": limit})


@app.get("/uptime/daily")
def uptime_daily(
    days: Annotated[int, Query(ge=1, le=365)] = 90, site_id: int | None = None, client: str | None = None
) -> list[dict[str, Any]]:
    """Uptime per giorno (calendario di Roma). I giorni senza controlli hanno checks = 0 e uptime = null."""
    with db.connect() as conn:
        if site_id is not None:
            _require_active(conn, site_id)
        rows = db.fetch_all(conn, "uptime_daily", {"days": days, "site_id": site_id, "client": client})
    return [{**r, "day": r["day"].isoformat()} for r in rows]


@app.get("/ssl/expiring")
def ssl_expiring(days: Annotated[int, Query(ge=1, le=365)] = 30) -> list[dict[str, Any]]:
    with db.connect() as conn:
        return db.fetch_all(conn, "ssl_expiring", {"days": days})


# --- Avvisi ------------------------------------------------------------------------------------


@app.post("/probe", dependencies=[Depends(require_token)])
def probe_sites(body: ProbeIn) -> dict[str, Any]:
    """Misura i siti da qui, cioè da Francoforte quando l'API è su Vercel (vedi `probe.py`).
    Il checker la chiama una volta per giro e usa questi tempi al posto di quelli presi dagli Stati Uniti.
    Uno dopo l'altro e non in parallelo: le misure non si contendono la rete della funzione."""
    results = [probe.measure(url, body.timeout).as_dict() for url in body.urls]
    return {"origin": probe.origin(), "results": results}


@app.post("/alerts/test", dependencies=[Depends(require_token)])
def alerts_test() -> dict[str, Any]:
    """Manda un messaggio di prova sui canali configurati (Slack, Telegram), per verificare la configurazione."""
    configured = alerts.channels()
    if not configured:
        raise HTTPException(409, "Nessun canale configurato: imposta SLACK_WEBHOOK_URL (o Telegram) sull'API")
    sent = alerts.send("👋 *Polso* è collegato: da qui arriveranno gli avvisi quando un sito va giù o torna online.")
    if not sent:
        raise HTTPException(502, "Invio non riuscito: controlla l'indirizzo del webhook")
    return {"ok": True, "channels": configured}


# --- Clienti -----------------------------------------------------------------------------------


@app.get("/clients")
def list_clients() -> list[dict[str, Any]]:
    """Clienti con almeno un sito attivo: servono per le pagine di stato e per il report."""
    with db.connect() as conn:
        return db.fetch_all(conn, "clients_list")


@app.get("/clients/{slug}")
def client_detail(slug: str) -> dict[str, Any]:
    with db.connect() as conn:
        row = db.fetch_one(conn, "client_exists", {"client": slug})
    if row is None:
        raise HTTPException(404, "Cliente non trovato")
    return {"slug": slug, "name": row["name"]}


# --- Domini ------------------------------------------------------------------------------------


@app.post("/domains", dependencies=[Depends(require_token)])
def save_domains(domains: list[DomainIn]) -> dict[str, int]:
    """Il checker manda una volta al giorno la scadenza dei domini (letta con RDAP o whois)."""
    if len(domains) > 200:
        raise HTTPException(413, "Massimo 200 domini per richiesta")
    with db.connect() as conn:
        saved = sum(
            1
            for d in domains
            if db.fetch_one(
                conn,
                "domain_update",
                {"url": d.url, "domain": d.domain, "expires_at": d.expires_at, "registrar": d.registrar},
            )
        )
        to_alert = _expiry_alerts(conn)
    for text in to_alert:
        alerts.send(text)
    return {"saved": saved}


def _expiry_alerts(conn: Any) -> list[str]:
    """Testi degli avvisi di scadenza da mandare, aggiornando le soglie già avvisate (nella stessa transazione)."""
    out: list[str] = []
    for s in db.fetch_all(conn, "expiry_state"):
        ssl_go, ssl_bucket = expiry.decide(s["ssl_days_left"], s["ssl_alert_bucket"], expiry.SSL_THRESHOLDS)
        dom_go, dom_bucket = expiry.decide(s["domain_days_left"], s["domain_alert_bucket"], expiry.DOMAIN_THRESHOLDS)
        if ssl_go:
            out.append(expiry.ssl_text(s["name"], s["url"], s["ssl_days_left"]))
        if dom_go:
            out.append(expiry.domain_text(s["name"], s["domain"], s["domain_days_left"], s["domain_registrar"]))
        if (ssl_bucket, dom_bucket) != (s["ssl_alert_bucket"], s["domain_alert_bucket"]):
            db.execute(conn, "expiry_save", {"id": s["id"], "ssl_bucket": ssl_bucket, "domain_bucket": dom_bucket})
    return out


# --- Attività programmate (heartbeat) ----------------------------------------------------------


@app.post("/heartbeats", dependencies=[Depends(require_token)])
def save_heartbeats(heartbeats: list[HeartbeatIn], sync: bool = False) -> dict[str, int]:
    """Definisce le attività da sorvegliare. Con `?sync=true` quelle non in lista vengono disattivate."""
    if len(heartbeats) > 100:
        raise HTTPException(413, "Massimo 100 attività per richiesta")
    with db.connect() as conn:
        for hb in heartbeats:
            db.fetch_one(conn, "heartbeat_upsert", hb.model_dump())
        deactivated = 0
        if sync:
            deactivated = len(
                db.fetch_all(conn, "heartbeats_deactivate_missing", {"slugs": [hb.slug for hb in heartbeats]})
            )
    return {"saved": len(heartbeats), "deactivated": deactivated}


@app.get("/heartbeats")
def list_heartbeats() -> list[dict[str, Any]]:
    """Elenco con lo stato. Controlla anche i ritardi: così l'avviso parte pure se il checker
    (che di solito se ne occupa) si è fermato e qualcuno apre la dashboard."""
    with db.connect() as conn:
        late = db.fetch_all(conn, "heartbeats_mark_late")
        rows = db.fetch_all(conn, "heartbeats_list")
    for hb in late:
        alerts.send(_late_text(hb))
    return rows


def _late_text(hb: dict[str, Any]) -> str:
    when = hb["last_ping_at"].astimezone(ROME)
    return f"⏰ *{hb['name']}* non dà segni di vita dal {when:%d/%m alle %H:%M}"


@app.post("/ping/{slug}", dependencies=[Depends(require_token)])
def ping(slug: str) -> dict[str, Any]:
    """Segno di vita di un'attività: basta un `curl -X POST` con il token alla fine di uno script.
    Il token va solo nell'header, mai nell'indirizzo: gli indirizzi finiscono nei log e nelle anteprime dei link."""
    with db.connect() as conn:
        row = db.fetch_one(conn, "heartbeat_ping", {"slug": slug})
    if row is None:
        raise HTTPException(404, "Attività non trovata: definiscila prima con POST /heartbeats")
    if row["was_late"]:
        alerts.send(f"✅ *{row['name']}* ha ripreso a dare segni di vita")
    return {"ok": True, "slug": slug, "pinged_at": row["last_ping_at"]}


# --- Report mensile ----------------------------------------------------------------------------


def _month(value: str | None) -> date:
    # il calendario è quello di Roma: il 1° del mese alle 00:30 è già il mese nuovo
    today = datetime.now(ROME).date()
    if value is None:
        return today.replace(day=1)
    try:
        first = datetime.strptime(value, "%Y-%m").date()
    except ValueError as err:
        raise HTTPException(422, "Il mese va scritto come AAAA-MM, es. 2026-09") from err
    if first > today or first.year < 2020:
        raise HTTPException(422, "Mese fuori intervallo")
    return first


@app.get("/report")
def report(month: str | None = None, client: str | None = None) -> dict[str, Any]:
    """Report di un mese (`?month=2026-09`), per tutti i siti o per un cliente (`&client=slug`)."""
    first = _month(month)
    params = {"month": first, "client": client}
    with db.connect() as conn:
        if client is not None and db.fetch_one(conn, "client_exists", {"client": client}) is None:
            raise HTTPException(404, "Cliente non trovato")
        sites = db.fetch_all(conn, "report_sites", params)
        incidents = db.fetch_all(conn, "report_incidents", params)
    checks = sum(s["checks"] for s in sites)
    up = sum(s["up"] for s in sites)
    return {
        "month": first.strftime("%Y-%m"),
        "client": client,
        "checks": checks,
        "uptime": round(100 * up / checks, 3) if checks else None,
        "incidents": len(incidents),
        "downtime_min": sum(s["downtime_min"] for s in sites),
        "sites": sites,
        "incident_list": incidents,
    }


# --- Badge -------------------------------------------------------------------------------------


def _badge_color(uptime: float | None) -> tuple[str, str]:
    """Colore di fondo e del testo: i colori di stato di Polso, con il testo leggibile su ognuno."""
    if uptime is None:
        return "#8e879b", "#ffffff"
    if uptime >= 99.9:
        return "#43bccd", "#1e1a27"
    if uptime >= 99:
        return "#f9c80e", "#1e1a27"
    if uptime >= 95:
        return "#f86624", "#1e1a27"
    return "#ea3546", "#ffffff"


def _text_width(text: str) -> int:
    return int(len(text) * 6.6) + 12


@app.get("/badge/{site_id}.svg", include_in_schema=True)
def badge(site_id: int, days: Annotated[int, Query(ge=1, le=90)] = 30) -> Response:
    """Badge SVG con l'uptime, da mettere in un README: `![uptime](https://.../badge/1.svg)`."""
    with db.connect() as conn:
        row = db.fetch_one(conn, "badge", {"site_id": site_id, "days": days})
    if row is None:
        raise HTTPException(404, "Sito non trovato")
    uptime = row["uptime"]
    label = f"uptime {days}g"
    value = "n/d" if uptime is None else f"{uptime:.2f}".rstrip("0").rstrip(".").replace(".", ",") + "%"
    bg, fg = _badge_color(uptime)
    lw, vw = _text_width(label), _text_width(value)
    w = lw + vw
    svg = "\n".join(
        [
            f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="20" role="img"'
            f' aria-label="{escape(label)}: {escape(value)}">',
            f"<title>{escape(row['name'])}: {escape(label)} {escape(value)}</title>",
            f'<clipPath id="r"><rect width="{w}" height="20" rx="4"/></clipPath>',
            f'<g clip-path="url(#r)"><rect width="{lw}" height="20" fill="#662e9b"/>'
            f'<rect x="{lw}" width="{vw}" height="20" fill="{bg}"/></g>',
            '<g font-family="Verdana,DejaVu Sans,sans-serif" font-size="11" text-anchor="middle">',
            f'<text x="{lw / 2}" y="14" fill="#ffffff">{escape(label)}</text>',
            f'<text x="{lw + vw / 2}" y="14" fill="{fg}">{escape(value)}</text>',
            "</g></svg>",
        ]
    )
    # i badge vengono mostrati da GitHub tramite il suo proxy: 5 minuti di cache bastano
    return Response(svg, media_type="image/svg+xml", headers={"Cache-Control": "public, max-age=300"})
