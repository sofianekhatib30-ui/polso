"""Accesso al database.

Le query non sono scritte qui: stanno in file .sql nella cartella sql/,
così si leggono (e si provano in psql) come SQL vero.
"""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from decimal import Decimal
from functools import cache
from pathlib import Path
from typing import Any

import psycopg
from psycopg.rows import dict_row

from .settings import settings

SQL_DIR = Path(__file__).parent / "sql"


@cache
def query(name: str) -> str:
    """Legge una query dalla cartella sql/ (una volta sola, poi resta in memoria)."""
    return (SQL_DIR / f"{name}.sql").read_text(encoding="utf-8")


@contextmanager
def connect() -> Iterator[psycopg.Connection[dict[str, Any]]]:
    """Apre una connessione per la durata di una richiesta.

    Una connessione per richiesta è la scelta più semplice e funziona anche
    su Vercel (funzioni serverless). prepare_threshold=None serve con il
    pooler di Supabase in modalità "transaction".
    Il blocco `with` fa commit se tutto va bene e rollback se c'è un'eccezione.
    """
    with psycopg.connect(
        settings.database_url,
        row_factory=dict_row,
        prepare_threshold=None,
        connect_timeout=10,
    ) as conn:
        # date sempre in UTC, qualunque sia il fuso del server
        conn.execute("SET TIME ZONE 'UTC'")
        yield conn


def _json_friendly(row: dict[str, Any]) -> dict[str, Any]:
    """I NUMERIC di Postgres arrivano come Decimal: li trasformiamo in numeri JSON normali."""
    return {k: float(v) if isinstance(v, Decimal) else v for k, v in row.items()}


def fetch_all(conn: psycopg.Connection, name: str, params: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    with conn.cursor() as cur:
        cur.execute(query(name), params or {})
        return [_json_friendly(r) for r in cur.fetchall()]


def fetch_one(conn: psycopg.Connection, name: str, params: dict[str, Any] | None = None) -> dict[str, Any] | None:
    with conn.cursor() as cur:
        cur.execute(query(name), params or {})
        row = cur.fetchone()
        return _json_friendly(row) if row else None


def ensure_schema() -> None:
    """Esegue schema.sql (solo CREATE ... IF NOT EXISTS)."""
    with connect() as conn:
        # se un'altra connessione tiene occupata una tabella, meglio rinunciare in fretta
        # (l'API parte lo stesso) che restare in coda bloccando anche le letture
        conn.execute("SET lock_timeout = '5s'")
        conn.execute(query("schema"))
