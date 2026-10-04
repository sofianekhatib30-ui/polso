"""Avvisi di scadenza per certificati SSL e domini.

Regola: un avviso a ogni soglia (es. 14, 7, 3, 1 giorni), mai due volte la stessa.
Per ogni sito il database ricorda l'ultima soglia avvisata (ssl_alert_bucket, domain_alert_bucket):
- se i giorni rimasti scendono sotto una soglia nuova, parte l'avviso e la soglia viene salvata;
- se il certificato o il dominio vengono rinnovati (giorni sopra la prima soglia), si riparte da zero.
La decisione è una funzione pura, testabile senza database.
"""

from __future__ import annotations

SSL_THRESHOLDS = (14, 7, 3, 1, 0)
DOMAIN_THRESHOLDS = (30, 14, 7, 3, 1, 0)
EXPIRED = -1


def bucket(days: int | None, thresholds: tuple[int, ...]) -> int | None:
    """La soglia più bassa che i giorni rimasti hanno raggiunto; EXPIRED se già scaduto; None se tutto ok."""
    if days is None:
        return None
    if days < 0:
        return EXPIRED
    reached = [t for t in thresholds if days <= t]
    return min(reached) if reached else None


def decide(days: int | None, last: int | None, thresholds: tuple[int, ...]) -> tuple[bool, int | None]:
    """Restituisce (avvisare?, nuova soglia da salvare)."""
    current = bucket(days, thresholds)
    if current is None:
        return False, None  # rinnovato o lontano dalla scadenza: si azzera
    if last is None or current < last:
        return True, current
    return False, last


def _when(days: int) -> str:
    if days < 0:
        return "è scaduto"
    if days == 0:
        return "scade oggi"
    return "scade domani" if days == 1 else f"scade tra {days} giorni"


def ssl_text(name: str, url: str, days: int) -> str:
    icon = "🔴" if days <= 1 else "🔒"
    hint = (
        "Il sito mostra un avviso di sicurezza a chi lo apre."
        if days < 0
        else "Di solito si rinnova da solo: se arriva questo messaggio, il rinnovo automatico non sta funzionando."
    )
    return f"{icon} *{name}*: il certificato SSL {_when(days)}.\n{hint}\n{url}"


def domain_text(name: str, domain: str, days: int, registrar: str | None) -> str:
    icon = "🔴" if days <= 7 else "🌐"
    where = f" dal pannello di {registrar}" if registrar else " dal pannello del registrar"
    action = "Rinnovalo subito" if days < 0 else "Controlla il rinnovo"
    return f"{icon} *{name}*: il dominio {domain} {_when(days)}.\n{action}{where}."
