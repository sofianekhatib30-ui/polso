"""Test delle funzioni aggiunte: clienti, header di sicurezza, domini, attività programmate, report, badge."""

from datetime import UTC, datetime, timedelta

import psycopg
import pytest

ADESSO = datetime.now(UTC).replace(second=0, microsecond=0)


def controllo(url: str, minuti_fa: int = 5, su: bool = True, **extra) -> dict:
    return {
        "url": url,
        "checked_at": (ADESSO - timedelta(minutes=minuti_fa)).isoformat(),
        "is_up": su,
        "status_code": 200 if su else 503,
        "response_ms": 250 if su else None,
        "error": None if su else "HTTP 503",
        **extra,
    }


@pytest.fixture()
def avvisi(monkeypatch):
    """Raccoglie gli avvisi invece di mandarli su Slack o Telegram."""
    inviati: list[str] = []
    from app import alerts

    monkeypatch.setattr(alerts, "send", lambda testo: inviati.append(testo) or True)
    return inviati


def test_clienti_e_filtri(client, auth):
    client.post(
        "/checks",
        json=[
            controllo("https://a.example.com", client="Fondazione L'Ancora", keyword="Benvenuti"),
            controllo("https://b.example.com", client="Fondazione L'Ancora", su=False),
            controllo("https://c.example.com"),
        ],
        headers=auth,
    )
    clienti = client.get("/clients").json()
    assert clienti == [{"slug": "fondazione-l-ancora", "name": "Fondazione L'Ancora", "sites": 2, "uptime_30d": 50.0}]
    assert client.get("/clients/fondazione-l-ancora").json()["name"] == "Fondazione L'Ancora"
    assert client.get("/clients/nessuno").status_code == 404

    siti = client.get("/sites", params={"client": "fondazione-l-ancora"}).json()
    assert {s["url"] for s in siti} == {"https://a.example.com", "https://b.example.com"}
    assert next(s for s in siti if s["url"].startswith("https://a"))["keyword"] == "Benvenuti"
    assert len(client.get("/sites").json()) == 3
    giorni = client.get("/uptime/daily", params={"days": 1, "client": "fondazione-l-ancora"}).json()
    assert len(giorni) == 2

    # il cliente tolto dal file dei siti sparisce anche dal database
    client.post("/checks", json=[controllo("https://a.example.com", minuti_fa=1)], headers=auth)
    assert client.get("/sites", params={"client": "fondazione-l-ancora"}).json()[0]["url"] == "https://b.example.com"


def test_header_di_sicurezza(client, auth):
    url = "https://sicuro.example.com"
    client.post("/checks", json=[controllo(url, security_headers=["hsts", "csp", "nosniff"])], headers=auth)
    assert client.get("/sites").json()[0]["security_headers"] == ["hsts", "csp", "nosniff"]
    sbagliato = controllo(url, security_headers=["x-inventato"])
    assert client.post("/checks", json=[sbagliato], headers=auth).status_code == 422


def test_scadenza_dominio(client, auth):
    url = "https://naivy.example.it"
    client.post("/checks", json=[controllo(url)], headers=auth)
    scadenza = (ADESSO + timedelta(days=40, hours=1)).isoformat()
    domini = [
        {"url": url, "domain": "example.it", "expires_at": scadenza, "registrar": "Aruba"},
        {"url": "https://sconosciuto.example.com", "domain": "example.com"},
    ]
    assert client.post("/domains", json=domini).status_code == 401
    assert client.post("/domains", json=domini, headers=auth).json() == {"saved": 1}
    assert client.get("/sites").json()[0]["domain_days_left"] == 40
    dettaglio = client.get("/sites/1").json()
    assert (dettaglio["domain"], dettaglio["domain_registrar"]) == ("example.it", "Aruba")
    assert client.post("/domains", json=[{**domini[0], "domain": "NON valido"}], headers=auth).status_code == 422
    # se oggi il registro non risponde, la scadenza già nota resta
    client.post("/domains", json=[{"url": url, "domain": "example.it"}], headers=auth)
    assert client.get("/sites").json()[0]["domain_days_left"] == 40


def test_slug_del_cliente():
    from app.models import slugify

    assert slugify("Fondazione L'Ancora") == "fondazione-l-ancora"
    assert slugify("Città più bella!") == "citta-piu-bella"
    assert slugify("★") == slugify("★") and slugify("★").startswith("cliente-")


def test_attivita_programmate(client, auth, avvisi):
    attivita = [
        {"slug": "backup-notturno", "name": "Backup notturno", "period_min": 1440, "grace_min": 60},
        {"slug": "domini", "name": "Controllo domini", "period_min": 1440},
    ]
    assert client.post("/heartbeats", json=attivita).status_code == 401
    assert client.post("/heartbeats", json=attivita, headers=auth).json() == {"saved": 2, "deactivated": 0}
    stati = {h["slug"]: h["status"] for h in client.get("/heartbeats").json()}
    assert stati == {"backup-notturno": "waiting", "domini": "waiting"}

    # il ping vuole il token nell'header, e solo in POST (mai nell'indirizzo)
    assert client.post("/ping/backup-notturno").status_code == 401
    assert client.get("/ping/backup-notturno", params={"key": "token-di-prova"}).status_code == 405
    assert client.post("/ping/backup-notturno", headers=auth).json()["ok"] is True
    assert client.post("/ping/inesistente", headers=auth).status_code == 404
    assert next(h for h in client.get("/heartbeats").json() if h["slug"] == "backup-notturno")["status"] == "ok"

    # l'ultimo segno di vita risale a 26 ore fa: periodo 24 h + tolleranza 1 h superati
    with psycopg.connect(_db(), autocommit=True) as c:
        c.execute("UPDATE heartbeats SET last_ping_at = now() - interval '26 hours' WHERE slug = 'backup-notturno'")
    assert next(h for h in client.get("/heartbeats").json() if h["slug"] == "backup-notturno")["status"] == "late"

    # al passaggio del checker parte UN avviso, non uno a ogni giro
    client.post("/checks", json=[controllo("https://x.example.com")], headers=auth)
    client.post("/checks", json=[controllo("https://x.example.com", minuti_fa=1)], headers=auth)
    assert len([a for a in avvisi if "Backup notturno" in a]) == 1

    # quando riparte, avviso di ripresa e stato di nuovo ok
    client.post("/ping/backup-notturno", headers=auth)
    assert any("ripreso" in a for a in avvisi)
    assert next(h for h in client.get("/heartbeats").json() if h["slug"] == "backup-notturno")["status"] == "ok"

    # sync: l'attività tolta dalla lista sparisce
    r = client.post("/heartbeats", params={"sync": "true"}, json=attivita[:1], headers=auth).json()
    assert r["deactivated"] == 1
    assert [h["slug"] for h in client.get("/heartbeats").json()] == ["backup-notturno"]


def _db() -> str:
    from tests.conftest import TEST_DB_URL

    return TEST_DB_URL


def test_report_mensile(client, auth):
    url = "https://report.example.com"
    client.post("/checks", json=[controllo(url, client="Cliente Uno")], headers=auth)
    mese = datetime.now(UTC).strftime("%Y-%m")
    # incidente di 90 minuti iniziato 2 ore fa e risolto 30 minuti fa
    with psycopg.connect(_db(), autocommit=True) as c:
        c.execute(
            "INSERT INTO incidents (site_id, started_at, resolved_at, cause) "
            "VALUES (1, now() - interval '120 minutes', now() - interval '30 minutes', 'HTTP 503')"
        )
    r = client.get("/report", params={"month": mese, "client": "cliente-uno"}).json()
    assert r["month"] == mese
    assert r["checks"] == 1 and r["uptime"] == 100.0
    # se il mese è iniziato da meno di 2 ore, una parte dell'incidente cade nel mese prima
    assert r["incidents"] == 1 and 0 < r["sites"][0]["downtime_min"] <= 90
    assert r["incident_list"][0]["cause"] == "HTTP 503"

    assert client.get("/report", params={"month": "2026-13"}).status_code == 422
    assert client.get("/report", params={"month": "2099-01"}).status_code == 422
    assert client.get("/report", params={"client": "nessuno"}).status_code == 404
    assert client.get("/report").json()["month"] == mese


def test_badge(client, auth):
    url = "https://badge.example.com"
    client.post("/checks", json=[controllo(url, minuti_fa=10), controllo(url, minuti_fa=5, su=False)], headers=auth)
    r = client.get("/badge/1.svg")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("image/svg+xml")
    assert "uptime 30g" in r.text and "50%" in r.text and "#ea3546" in r.text
    assert client.get("/badge/99.svg").status_code == 404


def test_avvisi_slack(client, auth, monkeypatch):
    import dataclasses

    from app import alerts

    # senza canali la prova risponde 409
    assert client.post("/alerts/test", headers=auth).status_code == 409
    assert client.post("/alerts/test").status_code == 401

    inviati: list[tuple[str, dict]] = []
    conf = dataclasses.replace(alerts.settings, slack_webhook_url="https://hooks.slack.com/services/T/B/X")
    monkeypatch.setattr(alerts, "settings", conf)
    monkeypatch.setattr(alerts, "_post_json", lambda url, body: inviati.append((url, body)) or True)

    r = client.post("/alerts/test", headers=auth)
    assert r.json() == {"ok": True, "channels": ["slack"]}
    url, body = inviati[0]
    assert url.startswith("https://hooks.slack.com/") and "Polso" in body["text"]
    assert body["blocks"][1]["elements"][0]["text"].startswith("<https://")

    # un webhook che non risponde non fa fallire niente: send restituisce False
    def rotto(url, body):
        raise OSError("rete giù")

    monkeypatch.setattr(alerts, "_post_json", rotto)
    assert alerts.send("prova") is False
    assert client.post("/alerts/test", headers=auth).status_code == 502
