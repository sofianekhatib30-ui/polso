"""Avvisi su Slack e/o Telegram (facoltativi).

- Slack: SLACK_WEBHOOK_URL, l'indirizzo di un "Incoming Webhook" collegato a un canale.
- Telegram: TELEGRAM_BOT_TOKEN e TELEGRAM_CHAT_ID.
Se nessuno dei due è impostato non succede nulla; se lo sono entrambi, l'avviso parte su tutti e due.

Un avviso che fallisce non deve mai bloccare il salvataggio dei controlli:
per questo gli errori vengono registrati nel log e basta.
"""

from __future__ import annotations

import json
import logging
import urllib.request

from .settings import settings

log = logging.getLogger("polso.alerts")


def channels() -> list[str]:
    """I canali configurati, per sapere dove partono gli avvisi."""
    found = []
    if settings.slack_webhook_url:
        found.append("slack")
    if settings.telegram_bot_token and settings.telegram_chat_id:
        found.append("telegram")
    return found


def enabled() -> bool:
    return bool(channels())


def _post_json(url: str, body: dict[str, object]) -> bool:
    req = urllib.request.Request(  # noqa: S310 (URL https da configurazione, non dall'utente)
        url, data=json.dumps(body).encode(), headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req, timeout=5) as resp:  # noqa: S310
        return 200 <= resp.status < 300


def _slack(text: str) -> bool:
    # Slack scrive in grassetto il testo tra asterischi; il link porta alla dashboard
    body = {
        "text": text,
        "blocks": [
            {"type": "section", "text": {"type": "mrkdwn", "text": text}},
            {
                "type": "context",
                "elements": [{"type": "mrkdwn", "text": f"<{settings.public_url}|Apri Polso>"}],
            },
        ],
    }
    return _post_json(settings.slack_webhook_url, body)


def _telegram(text: str) -> bool:
    url = f"https://api.telegram.org/bot{settings.telegram_bot_token}/sendMessage"
    return _post_json(url, {"chat_id": settings.telegram_chat_id, "text": text.replace("*", "")})


def send(text: str) -> bool:
    """Manda l'avviso su tutti i canali configurati. True se almeno uno l'ha ricevuto."""
    ok = False
    for name, fn in (("slack", _slack), ("telegram", _telegram)):
        if name not in channels():
            continue
        try:
            ok = fn(text) or ok
        except Exception:  # un avviso mancato non deve far fallire la richiesta
            log.exception("Invio avviso %s non riuscito", name)
    return ok
