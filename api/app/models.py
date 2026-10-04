"""Forma dei dati in entrata e in uscita, validata da Pydantic."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from pydantic import BaseModel, Field, field_validator


class CheckIn(BaseModel):
    """Un controllo inviato dal checker."""

    url: str = Field(max_length=300)
    name: str | None = Field(default=None, max_length=120)
    checked_at: datetime | None = None
    is_up: bool
    status_code: int | None = Field(default=None, ge=100, le=599)
    response_ms: int | None = Field(default=None, ge=0, le=600_000)
    ssl_expires_at: datetime | None = None
    error: str | None = Field(default=None, max_length=500)

    @field_validator("url")
    @classmethod
    def url_http(cls, value: str) -> str:
        value = value.strip().rstrip("/")
        if not value.startswith(("http://", "https://")) or " " in value:
            raise ValueError("l'URL deve iniziare con http:// o https://")
        return value

    @field_validator("checked_at", "ssl_expires_at")
    @classmethod
    def con_fuso_orario(cls, value: datetime | None) -> datetime | None:
        if value is not None and value.tzinfo is None:
            raise ValueError("la data deve avere il fuso orario, es. 2026-10-04T12:00:00Z")
        return value

    @field_validator("checked_at")
    @classmethod
    def non_nel_futuro(cls, value: datetime | None) -> datetime | None:
        # un controllo "dal futuro" resterebbe per sempre l'ultimo e bloccherebbe gli incidenti
        if value is not None and value > datetime.now(UTC) + timedelta(minutes=5):
            raise ValueError("checked_at è nel futuro")
        return value


class IngestResult(BaseModel):
    saved: int
    incidents_opened: int
    incidents_resolved: int
