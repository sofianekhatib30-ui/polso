"""Forma dei dati in entrata e in uscita, validata da Pydantic."""

from __future__ import annotations

import hashlib
import re
import unicodedata
from datetime import UTC, datetime, timedelta
from typing import Literal

from pydantic import BaseModel, Field, field_validator

# Gli header di sicurezza che il checker riconosce, con un nome corto
SecurityHeader = Literal["hsts", "csp", "nosniff", "frame", "referrer", "permissions"]


def slugify(text: str) -> str:
    """'Fondazione L'Ancora' -> 'fondazione-l-ancora': va bene in un indirizzo web."""
    plain = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    slug = re.sub(r"[^a-z0-9]+", "-", plain.lower()).strip("-")[:60].strip("-")
    # un nome senza lettere latine ("★", "東京") darebbe uno slug vuoto: si usa un codice stabile
    return slug or "cliente-" + hashlib.sha256(text.encode()).hexdigest()[:8]


def _url(value: str) -> str:
    value = value.strip().rstrip("/")
    if not value.startswith(("http://", "https://")) or " " in value:
        raise ValueError("l'URL deve iniziare con http:// o https://")
    return value


def _tz(value: datetime | None) -> datetime | None:
    if value is not None and value.tzinfo is None:
        raise ValueError("la data deve avere il fuso orario, es. 2026-10-04T12:00:00Z")
    return value


class Timing(BaseModel):
    """Dove va il tempo di una risposta (tutti in millisecondi, tranne il peso in byte)."""

    redirect_ms: int = Field(ge=0, le=600_000)
    wait_ms: int = Field(ge=0, le=600_000)
    download_ms: int = Field(ge=0, le=600_000)
    size_bytes: int = Field(ge=0, le=100_000_000)
    redirects: int = Field(ge=0, le=50)
    # da dove sono presi i tempi: la regione di Vercel (es. "fra1") quando misura l'API, assente se dal checker
    origin: str | None = Field(default=None, max_length=16, pattern=r"^[a-z0-9-]+$")


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
    # facoltativi: chi è il cliente, quale testo deve comparire nella pagina, quali header di sicurezza ci sono
    client: str | None = Field(default=None, max_length=80)
    keyword: str | None = Field(default=None, max_length=200)
    security_headers: list[SecurityHeader] | None = Field(default=None, max_length=10)
    # dove è finita la richiesta dopo i redirect, e l'icona dichiarata nella pagina (anche relativa)
    final_url: str | None = None
    icon_href: str | None = None
    timing: Timing | None = None

    @field_validator("url")
    @classmethod
    def url_http(cls, value: str) -> str:
        return _url(value)

    @field_validator("final_url", "icon_href")
    @classmethod
    def extra_facoltativi(cls, value: str | None) -> str | None:
        # sono dettagli: un valore strano (un'icona data: lunghissima, un indirizzo enorme)
        # si scarta, non deve far rifiutare il controllo di tutti i siti
        if not value:
            return None
        low = value.lower()
        # icone incorporate nella pagina: solo immagini e non oltre 100 KB
        if low.startswith("data:"):
            return value if low.startswith("data:image/") and len(value) <= 100_000 else None
        if len(value) > 1000 or low.startswith("javascript:"):
            return None
        return value

    @field_validator("client", "keyword")
    @classmethod
    def vuoto_come_nessuno(cls, value: str | None) -> str | None:
        value = value.strip() if value else None
        return value or None

    @field_validator("checked_at", "ssl_expires_at")
    @classmethod
    def con_fuso_orario(cls, value: datetime | None) -> datetime | None:
        return _tz(value)

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
    sites_deactivated: int = 0


class DomainIn(BaseModel):
    """Scadenza del dominio di un sito, letta dal checker con RDAP o whois."""

    url: str = Field(max_length=300)
    domain: str = Field(max_length=253, pattern=r"^[a-z0-9.-]+\.[a-z]{2,}$")
    expires_at: datetime | None = None
    registrar: str | None = Field(default=None, max_length=200)

    @field_validator("url")
    @classmethod
    def url_http(cls, value: str) -> str:
        return _url(value)

    @field_validator("expires_at")
    @classmethod
    def con_fuso_orario(cls, value: datetime | None) -> datetime | None:
        return _tz(value)


class HeartbeatIn(BaseModel):
    """Un'attività programmata che deve dare segni di vita almeno ogni `period_min` minuti."""

    slug: str = Field(pattern=r"^[a-z0-9][a-z0-9-]{0,59}$")
    name: str = Field(min_length=1, max_length=120)
    period_min: int = Field(ge=1, le=60 * 24 * 31)
    grace_min: int = Field(default=0, ge=0, le=60 * 24 * 7)


class ProbeIn(BaseModel):
    """Richiesta di misura da Francoforte: gli indirizzi da misurare, uno dopo l'altro."""

    urls: list[str] = Field(min_length=1, max_length=50)
    timeout: float = Field(default=15.0, gt=0, le=30)

    @field_validator("urls")
    @classmethod
    def _http_only(cls, urls: list[str]) -> list[str]:
        for url in urls:
            if not url.startswith(("http://", "https://")) or len(url) > 2000:
                raise ValueError(f"indirizzo non valido: {url[:100]}")
        return urls
