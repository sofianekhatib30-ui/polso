"""Avvisi di scadenza: la regola (funzione pura) e il giro completo con l'API."""

from datetime import UTC, datetime, timedelta

import pytest

from app import expiry

S, D = expiry.SSL_THRESHOLDS, expiry.DOMAIN_THRESHOLDS


@pytest.mark.parametrize(
    ("days", "last", "atteso"),
    [
        (60, None, (False, None)),  # lontano: niente
        (14, None, (True, 14)),  # prima soglia
        (12, 14, (False, 14)),  # stessa soglia: non si ripete
        (7, 14, (True, 7)),  # soglia nuova
        (0, 1, (True, 0)),  # scade oggi
        (-2, 0, (True, -1)),  # scaduto
        (-3, -1, (False, -1)),  # scaduto, già avvisato
        (80, -1, (False, None)),  # rinnovato: si azzera
        (None, 7, (False, None)),  # dato mancante
    ],
)
def test_regola_ssl(days, last, atteso):
    assert expiry.decide(days, last, S) == atteso


def test_soglie_dominio_partono_da_30():
    assert expiry.decide(30, None, D) == (True, 30)
    assert expiry.decide(30, None, S) == (False, None)


def test_testi():
    assert "scade tra 7 giorni" in expiry.ssl_text("Naivy", "https://naivy.it", 7)
    assert "è scaduto" in expiry.domain_text("Naivy", "naivy.it", -1, "Aruba")
    assert "Aruba" in expiry.domain_text("Naivy", "naivy.it", 20, "Aruba")


def controllo(url: str, minuti_fa: int, ssl_giorni: float) -> dict:
    ora = datetime.now(UTC)
    return {
        "url": url,
        "name": "Sito",
        "checked_at": (ora - timedelta(minutes=minuti_fa)).isoformat(),
        "is_up": True,
        "status_code": 200,
        "response_ms": 200,
        # mezz'ora in più: i giorni interi rimasti restano quelli voluti anche con qualche secondo di test
        "ssl_expires_at": (ora + timedelta(days=ssl_giorni, minutes=30)).isoformat(),
    }


def test_avvisi_scadenza_dall_api(client, auth, monkeypatch):
    from app import alerts

    inviati: list[str] = []
    monkeypatch.setattr(alerts, "send", lambda t: inviati.append(t) or True)
    url = "https://scade.example.com"

    client.post("/checks", json=[controllo(url, 50, 60)], headers=auth)
    assert inviati == []
    client.post("/checks", json=[controllo(url, 40, 10)], headers=auth)
    assert len(inviati) == 1 and "certificato SSL scade tra 10 giorni" in inviati[0]
    client.post("/checks", json=[controllo(url, 30, 10)], headers=auth)
    assert len(inviati) == 1  # stessa soglia: nessun doppione
    client.post("/checks", json=[controllo(url, 20, 2)], headers=auth)
    assert len(inviati) == 2 and "scade tra 2 giorni" in inviati[1]
    client.post("/checks", json=[controllo(url, 10, 90)], headers=auth)  # rinnovato
    client.post("/checks", json=[controllo(url, 5, 13)], headers=auth)
    assert len(inviati) == 3  # dopo il rinnovo si riparte dalla prima soglia

    # dominio: avviso quando arriva la scadenza dal controllo giornaliero
    scad = (datetime.now(UTC) + timedelta(days=25, minutes=30)).isoformat()
    dom = {"url": url, "domain": "example.com", "expires_at": scad, "registrar": "Aruba"}
    client.post("/domains", json=[dom], headers=auth)
    assert "dominio example.com scade tra 25 giorni" in inviati[-1] and "Aruba" in inviati[-1]
    client.post("/domains", json=[dom], headers=auth)
    assert sum("dominio" in t for t in inviati) == 1
