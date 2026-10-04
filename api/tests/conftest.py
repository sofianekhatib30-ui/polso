"""Preparazione dei test.

I test dell'API usano un PostgreSQL vero (database separato `polso_test`),
non un finto database: così proviamo anche le query SQL.
Indirizzo da TEST_DATABASE_URL; se il database non c'è, quei test vengono saltati.
"""

from __future__ import annotations

import os
from pathlib import Path

import psycopg
import pytest

TEST_DB_URL = os.environ.get("TEST_DATABASE_URL", "postgresql://postgres@localhost:5432/polso_test")
TOKEN = "token-di-prova"

# Le variabili vanno impostate PRIMA di importare l'app, che le legge all'avvio.
os.environ["DATABASE_URL"] = TEST_DB_URL
os.environ["POLSO_INGEST_TOKEN"] = TOKEN
os.environ.pop("TELEGRAM_BOT_TOKEN", None)

SCHEMA = Path(__file__).resolve().parents[1] / "app" / "sql" / "schema.sql"


def _database_available() -> bool:
    try:
        with psycopg.connect(TEST_DB_URL, connect_timeout=3):
            return True
    except psycopg.OperationalError:
        return False


@pytest.fixture()
def clean_db():
    """Database vuoto con lo schema appena creato, per ogni test."""
    if not _database_available():
        if os.environ.get("CI"):
            # in CI un database mancante è un errore, non un test da saltare in silenzio
            pytest.fail(f"PostgreSQL non raggiungibile su {TEST_DB_URL}")
        pytest.skip(f"PostgreSQL non raggiungibile su {TEST_DB_URL}")
    with psycopg.connect(TEST_DB_URL, autocommit=True) as conn:
        conn.execute("DROP TABLE IF EXISTS heartbeat_pings, heartbeats, incidents, checks, sites CASCADE")
        conn.execute(SCHEMA.read_text(encoding="utf-8"))
    yield TEST_DB_URL


@pytest.fixture()
def client(clean_db):
    from fastapi.testclient import TestClient

    from app.main import app

    return TestClient(app)


@pytest.fixture()
def auth() -> dict[str, str]:
    return {"Authorization": f"Bearer {TOKEN}"}
