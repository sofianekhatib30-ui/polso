"""Configurazione letta dalle variabili d'ambiente (mai valori segreti nel codice)."""

from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    database_url: str
    # token che il checker deve mandare per poter scrivere i controlli
    ingest_token: str
    # avvisi Telegram facoltativi: se mancano, gli avvisi sono spenti
    telegram_bot_token: str
    telegram_chat_id: str
    # quanti controlli "giù" di fila servono per aprire un incidente
    down_threshold: int


def load() -> Settings:
    return Settings(
        database_url=os.environ.get("DATABASE_URL", "postgresql://postgres@localhost:5432/polso").strip(),
        # strip(): uno spazio o un a capo copiati per sbaglio con il token non devono bloccare tutto
        ingest_token=os.environ.get("POLSO_INGEST_TOKEN", "").strip(),
        telegram_bot_token=os.environ.get("TELEGRAM_BOT_TOKEN", ""),
        telegram_chat_id=os.environ.get("TELEGRAM_CHAT_ID", ""),
        down_threshold=int(os.environ.get("POLSO_DOWN_THRESHOLD", "2")),
    )


settings = load()
