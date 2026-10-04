"""Avvisi su Telegram (facoltativi).

Se TELEGRAM_BOT_TOKEN e TELEGRAM_CHAT_ID non sono impostati non succede nulla.
Un avviso che fallisce non deve mai bloccare il salvataggio dei controlli:
per questo gli errori vengono registrati nel log e basta.
"""

from __future__ import annotations

import json
import logging
import urllib.request

from .settings import settings

log = logging.getLogger("polso.alerts")


def enabled() -> bool:
    return bool(settings.telegram_bot_token and settings.telegram_chat_id)


def send(text: str) -> bool:
    if not enabled():
        return False
    url = f"https://api.telegram.org/bot{settings.telegram_bot_token}/sendMessage"
    body = json.dumps({"chat_id": settings.telegram_chat_id, "text": text}).encode()
    req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"})  # noqa: S310
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:  # noqa: S310 (URL fisso https)
            return resp.status == 200
    except Exception:  # un avviso mancato non deve far fallire la richiesta
        log.exception("Invio avviso Telegram non riuscito")
        return False
