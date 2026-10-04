"""API di Polso.

Scrittura (protetta da token):  POST /checks
Lettura (pubblica):             GET /sites, /sites/{id}, /sites/{id}/series,
                                /sites/{id}/transitions, /incidents, /ssl/expiring, /health
"""

from __future__ import annotations

import logging
import secrets
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from typing import Annotated, Any
from urllib.parse import urlparse

from fastapi import Depends, FastAPI, Header, HTTPException, Query, Response
from fastapi.responses import RedirectResponse

from . import alerts, db
from .incidents import CheckState, decide
from .models import CheckIn, IngestResult
from .settings import settings

log = logging.getLogger("polso")


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


def require_token(authorization: Annotated[str | None, Header()] = None) -> None:
    """Accetta solo richieste con l'header `Authorization: Bearer <token>` giusto."""
    if not settings.ingest_token:
        # senza token configurato la scrittura resta chiusa, mai aperta a tutti
        raise HTTPException(503, "Scrittura disattivata: POLSO_INGEST_TOKEN non impostato")
    expected = f"Bearer {settings.ingest_token}"
    # compare_digest confronta in tempo costante: non rivela quanti caratteri sono giusti
    if not authorization or not secrets.compare_digest(authorization.encode(), expected.encode()):
        raise HTTPException(401, "Token mancante o non valido")


def _default_name(url: str) -> str:
    return urlparse(url).hostname or url


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
                {"url": check.url, "name": check.name or _default_name(check.url), "given_name": check.name},
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
                    to_alert.append(f"🔴 {check.url} è giù ({decision.cause or 'nessuna risposta'})")
            elif (
                decision.action == "close"
                and open_incident
                and db.fetch_one(conn, "resolve_incident", {"id": open_incident["id"], "resolved_at": decision.at})
            ):
                resolved += 1
                to_alert.append(f"🟢 {check.url} è tornato online")

        deactivated = 0
        if sync:
            deactivated = len(db.fetch_all(conn, "deactivate_missing", {"urls": [c.url for c in checks]}))

    # Gli avvisi partono solo DOPO il commit: mai avvisare di qualcosa che non è stato salvato.
    for text in to_alert:
        alerts.send(text)

    return IngestResult(
        saved=len(checks), incidents_opened=opened, incidents_resolved=resolved, sites_deactivated=deactivated
    )


@app.get("/sites")
def list_sites() -> list[dict[str, Any]]:
    with db.connect() as conn:
        return db.fetch_all(conn, "sites_overview")


@app.get("/sites/{site_id}")
def site_detail(site_id: int) -> dict[str, Any]:
    with db.connect() as conn:
        row = db.fetch_one(conn, "site_detail", {"site_id": site_id})
    if row is None:
        raise HTTPException(404, "Sito non trovato")
    return row


@app.get("/sites/{site_id}/series")
def site_series(site_id: int, hours: Annotated[int, Query(ge=1, le=24 * 30)] = 72) -> list[dict[str, Any]]:
    with db.connect() as conn:
        return db.fetch_all(conn, "response_series", {"site_id": site_id, "hours": hours})


@app.get("/sites/{site_id}/transitions")
def site_transitions(site_id: int, limit: Annotated[int, Query(ge=1, le=200)] = 20) -> list[dict[str, Any]]:
    with db.connect() as conn:
        return db.fetch_all(conn, "transitions", {"site_id": site_id, "limit": limit})


@app.get("/incidents")
def list_incidents(site_id: int | None = None, limit: Annotated[int, Query(ge=1, le=200)] = 50) -> list[dict[str, Any]]:
    with db.connect() as conn:
        return db.fetch_all(conn, "incidents_list", {"site_id": site_id, "limit": limit})


@app.get("/ssl/expiring")
def ssl_expiring(days: Annotated[int, Query(ge=1, le=365)] = 30) -> list[dict[str, Any]]:
    with db.connect() as conn:
        return db.fetch_all(conn, "ssl_expiring", {"days": days})
