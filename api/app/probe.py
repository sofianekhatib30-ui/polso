"""Misura dei tempi da Francoforte.

Il checker gira su GitHub, i cui server sono negli Stati Uniti: per un sito servito in Europa
ogni misura porta con sé l'attraversamento dell'Atlantico, e i tempi sembrano più alti di quelli
che vede chi lo apre dall'Italia. L'API è pubblicata su Vercel a Francoforte (fra1): da qui
misura ogni sito con le stesse regole del checker, e il checker usa questi tempi al posto dei suoi.

Le parti sono le stesse di curl nel checker, ricavate allo stesso modo:
    redirect = dall'inizio a quando parte la richiesta finale
    attesa   = dalla richiesta finale al primo byte della risposta (connessione, TLS, lavoro del server)
    download = dal primo byte alla fine della pagina
Come curl, la connessione si riusa tra un redirect e l'altro sullo stesso host, e la pagina si
scarica senza compressione: i byte sono quelli che misura il checker.

Sicurezza: l'endpoint è protetto dal token, e in più rifiuta gli indirizzi che portano a reti
private (127.0.0.1, 10.x, 169.254.x...), anche dopo un redirect: un'API che apre indirizzi a
richiesta non deve diventare un modo per guardare dentro la rete di Vercel.
"""

from __future__ import annotations

import http.client
import ipaddress
import os
import socket
import ssl
import time
from dataclasses import asdict, dataclass
from urllib.parse import urljoin, urlsplit

USER_AGENT = "PolsoMonitor/1.0"
MAX_REDIRECTS = 5
MAX_BYTES = 5_000_000  # come --max-filesize del checker
REDIRECT_CODES = {301, 302, 303, 307, 308}


@dataclass
class Probe:
    url: str
    status_code: int | None
    total_ms: int | None = None
    redirect_ms: int | None = None
    wait_ms: int | None = None
    download_ms: int | None = None
    size_bytes: int | None = None
    redirects: int = 0
    final_url: str | None = None
    error: str | None = None

    def as_dict(self) -> dict[str, object]:
        return asdict(self)


def origin() -> str:
    """Da dove si misura: la regione di Vercel, oppure "locale" quando l'API gira altrove."""
    return os.environ.get("VERCEL_REGION") or "locale"


class _Blocked(Exception):
    pass


def _public_host(host: str, port: int) -> None:
    """Solleva _Blocked se il nome porta anche a un solo indirizzo non pubblico."""
    try:
        infos = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    except socket.gaierror as exc:
        raise OSError(f"nome non risolto: {host}") from exc
    for info in infos:
        addr = ipaddress.ip_address(info[4][0])
        if not addr.is_global:
            raise _Blocked(f"indirizzo non pubblico: {host}")


def _connection(scheme: str, host: str, port: int, timeout: float) -> http.client.HTTPConnection:
    if scheme == "https":
        return http.client.HTTPSConnection(host, port, timeout=timeout, context=ssl.create_default_context())
    return http.client.HTTPConnection(host, port, timeout=timeout)


def measure(url: str, timeout: float = 15.0, allow_private: bool = False) -> Probe:
    """Una misura completa, redirect compresi. Non solleva: gli errori finiscono in `error`."""
    start = time.perf_counter()
    deadline = start + timeout
    current = url
    hops = 0
    conns: dict[tuple[str, str, int], http.client.HTTPConnection] = {}
    try:
        while True:
            parts = urlsplit(current)
            scheme = parts.scheme.lower()
            if scheme not in ("http", "https") or not parts.hostname:
                return Probe(url, None, redirects=hops, error=f"indirizzo non valido: {current[:200]}")
            port = parts.port or (443 if scheme == "https" else 80)
            key = (scheme, parts.hostname, port)
            remaining = deadline - time.perf_counter()
            if remaining <= 0:
                return Probe(url, None, redirects=hops, error=f"tempo scaduto dopo {timeout:g} s")
            conn = conns.get(key)
            if conn is None:
                if not allow_private:
                    _public_host(parts.hostname, port)
                conn = conns[key] = _connection(scheme, parts.hostname, port, remaining)
            path = parts.path or "/"
            if parts.query:
                path += "?" + parts.query

            request_at = time.perf_counter()
            conn.request("GET", path, headers={"User-Agent": USER_AGENT, "Accept": "*/*"})
            resp = conn.getresponse()
            first_byte_at = time.perf_counter()
            location = resp.getheader("Location")

            if resp.status in REDIRECT_CODES and location and hops < MAX_REDIRECTS:
                resp.read()  # svuota la risposta, così la connessione si può riusare
                if resp.will_close:
                    conn.close()
                    conns.pop(key, None)
                current = urljoin(current, location)
                hops += 1
                continue

            body = resp.read(MAX_BYTES + 1)
            end = time.perf_counter()
            if len(body) > MAX_BYTES:
                return Probe(url, resp.status, redirects=hops, final_url=current, error="pagina oltre 5 MB")

            def ms(seconds: float) -> int:
                return max(0, int(seconds * 1000))

            return Probe(
                url=url,
                status_code=resp.status,
                total_ms=ms(end - start),
                redirect_ms=ms(request_at - start),
                wait_ms=ms(first_byte_at - request_at),
                download_ms=ms(end - first_byte_at),
                size_bytes=len(body),
                redirects=hops,
                final_url=current,
            )
    except _Blocked as exc:
        return Probe(url, None, redirects=hops, error=str(exc))
    except (OSError, http.client.HTTPException, ssl.SSLError, ValueError) as exc:
        text = str(exc) or type(exc).__name__
        return Probe(url, None, redirects=hops, error=text[:300])
    finally:
        for conn in conns.values():
            conn.close()
