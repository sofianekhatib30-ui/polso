"""Regole degli incidenti.

La decisione è una funzione "pura": riceve i dati, restituisce cosa fare,
non tocca il database. Così si testa in un attimo, senza database.

Regole:
- si APRE un incidente quando gli ultimi `threshold` controlli sono tutti giù
  (uno solo potrebbe essere un falso allarme di rete);
- si CHIUDE quando l'ultimo controllo è di nuovo su.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Literal


@dataclass(frozen=True)
class CheckState:
    checked_at: datetime
    is_up: bool
    error: str | None = None


@dataclass(frozen=True)
class Decision:
    action: Literal["open", "close", "none"]
    at: datetime | None = None  # inizio (open) o fine (close) dell'incidente
    cause: str | None = None


def decide(recent: list[CheckState], has_open_incident: bool, threshold: int = 2) -> Decision:
    """Decide cosa fare dato l'elenco dei controlli recenti, dal PIÙ RECENTE al più vecchio."""
    if threshold < 1:
        raise ValueError("threshold deve essere almeno 1")
    if not recent:
        return Decision("none")

    latest = recent[0]

    if has_open_incident:
        if latest.is_up:
            return Decision("close", at=latest.checked_at)
        return Decision("none")

    window = recent[:threshold]
    if len(window) == threshold and all(not c.is_up for c in window):
        # l'incidente inizia dal PRIMO controllo giù della serie, non dall'ultimo
        first_down = window[-1]
        return Decision("open", at=first_down.checked_at, cause=latest.error or first_down.error)

    return Decision("none")
