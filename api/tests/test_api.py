"""Test dell'API con un PostgreSQL vero."""

from datetime import UTC, datetime, timedelta

# 10 ore fa, all'ora esatta: i controlli dei test non devono essere nel futuro
T0 = datetime.now(UTC).replace(minute=0, second=0, microsecond=0) - timedelta(hours=10)
URL = "https://negozio.example.com"


def controllo(ore: int, su: bool, **extra) -> dict:
    return {
        "url": URL,
        "checked_at": (T0 + timedelta(hours=ore)).isoformat(),
        "is_up": su,
        "status_code": 200 if su else None,
        "response_ms": 300 if su else None,
        "error": None if su else "curl: (28) Operation timed out",
        **extra,
    }


def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"ok": True, "database": True}


def test_scrittura_senza_token_rifiutata(client):
    r = client.post("/checks", json=[controllo(0, True)])
    assert r.status_code == 401


def test_token_sbagliato_rifiutato(client):
    r = client.post("/checks", json=[controllo(0, True)], headers={"Authorization": "Bearer sbagliato"})
    assert r.status_code == 401


def test_dati_non_validi_rifiutati(client, auth):
    for errato in (
        {**controllo(0, True), "url": "ftp://x"},
        {**controllo(0, True), "status_code": 42},
        {**controllo(0, True), "checked_at": "2026-10-04T10:00:00"},  # senza fuso orario
    ):
        assert client.post("/checks", json=[errato], headers=auth).status_code == 422
    assert client.post("/checks", json=[], headers=auth).status_code == 422


def test_ciclo_completo_incidente(client, auth):
    # su, giù, giù (si apre), giù (resta aperto), su (si chiude)
    risultati = [
        client.post("/checks", json=[c], headers=auth).json()
        for c in (
            controllo(0, True),
            controllo(1, False),
            controllo(2, False),
            controllo(3, False),
            controllo(4, True),
        )
    ]
    assert [r["incidents_opened"] for r in risultati] == [0, 0, 1, 0, 0]
    assert [r["incidents_resolved"] for r in risultati] == [0, 0, 0, 0, 1]

    incidenti = client.get("/incidents").json()
    assert len(incidenti) == 1
    inc = incidenti[0]
    assert inc["site_url"] == URL
    assert datetime.fromisoformat(inc["started_at"]) == T0 + timedelta(hours=1)  # dal primo controllo giù
    assert datetime.fromisoformat(inc["resolved_at"]) == T0 + timedelta(hours=4)
    assert inc["duration_min"] == 180

    sito = client.get("/sites").json()[0]
    assert sito["name"] == "negozio.example.com"
    assert sito["open_incident"] is False

    cambi = client.get(f"/sites/{sito['id']}/transitions").json()
    assert [c["is_up"] for c in cambi] == [True, False]


def test_statistiche_e_serie(client, auth):
    adesso = datetime.now(UTC).replace(minute=0, second=0, microsecond=0)
    batch = [
        {
            "url": URL,
            "checked_at": (adesso - timedelta(hours=h)).isoformat(),
            "is_up": True,
            "status_code": 200,
            "response_ms": 100 * (h + 1),
        }
        for h in range(10)
    ]
    assert client.post("/checks", json=batch, headers=auth).json()["saved"] == 10

    sito = client.get("/sites").json()[0]
    assert sito["uptime_24h"] == 100
    # p95 di 100..1000 ms con interpolazione lineare = 955
    assert sito["p95_ms_24h"] == 955

    dettaglio = client.get(f"/sites/{sito['id']}").json()
    assert dettaglio["checks_30d"] == 10
    assert dettaglio["p50_ms_7d"] == 550

    serie = client.get(f"/sites/{sito['id']}/series", params={"hours": 24}).json()
    assert len(serie) == 24  # tutte le ore, anche quelle senza controlli
    assert sum(p["checks"] for p in serie) == 10


def test_ssl_in_scadenza(client, auth):
    scade = datetime.now(UTC) + timedelta(days=10)
    client.post("/checks", json=[controllo(0, True, ssl_expires_at=scade.isoformat())], headers=auth)
    assert len(client.get("/ssl/expiring", params={"days": 30}).json()) == 1
    assert client.get("/ssl/expiring", params={"days": 5}).json() == []


def test_sito_inesistente(client):
    assert client.get("/sites/999").status_code == 404


def test_token_con_caratteri_strani_non_rompe_l_api(client):
    r = client.post("/checks", json=[controllo(0, True)], headers={"Authorization": "Bearer città".encode()})
    assert r.status_code == 401


def test_data_nel_futuro_rifiutata(client, auth):
    futuro = (datetime.now(UTC) + timedelta(days=1)).isoformat()
    assert client.post("/checks", json=[controllo(0, True, checked_at=futuro)], headers=auth).status_code == 422


def test_nome_del_sito_aggiornato(client, auth):
    client.post("/checks", json=[controllo(0, True)], headers=auth)
    assert client.get("/sites").json()[0]["name"] == "negozio.example.com"
    client.post("/checks", json=[controllo(1, True, name="Negozio Rossi")], headers=auth)
    assert client.get("/sites").json()[0]["name"] == "Negozio Rossi"
    # un controllo senza nome non cancella quello già dato
    client.post("/checks", json=[controllo(2, True)], headers=auth)
    assert client.get("/sites").json()[0]["name"] == "Negozio Rossi"


def test_schema_rieseguibile(clean_db):
    # all'avvio l'API riesegue lo schema: su un database già pronto non deve dare errori
    from app import db

    db.ensure_schema()
    db.ensure_schema()
