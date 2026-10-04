"""Misura da Francoforte: le parti dei tempi, i redirect e il blocco delle reti private."""

from __future__ import annotations

import threading
import time
from collections.abc import Iterator
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pytest

from app import probe

PAGE = b"<html><body>ciao</body></html>" * 100


class _Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"  # connessioni riusabili, come un server vero

    def do_GET(self) -> None:  # noqa: N802 (nome imposto da http.server)
        if self.path == "/vecchio":
            self._send(301, b"", {"Location": "/nuovo"})
        elif self.path == "/nuovo":
            self._send(302, b"", {"Location": "/pagina"})
        elif self.path == "/pagina":
            time.sleep(0.05)  # il "lavoro del server": deve finire nell'attesa
            self._send(200, PAGE, {"Content-Type": "text/html"})
        elif self.path == "/giro":
            self._send(302, b"", {"Location": "/giro"})
        else:
            self._send(404, b"no", {})

    def _send(self, code: int, body: bytes, headers: dict[str, str]) -> None:
        self.send_response(code)
        for name, value in headers.items():
            self.send_header(name, value)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *_: object) -> None:
        pass


@pytest.fixture()
def server() -> Iterator[str]:
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), _Handler)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    yield f"http://127.0.0.1:{httpd.server_address[1]}"
    httpd.shutdown()


def test_pagina_con_due_redirect(server):
    r = probe.measure(f"{server}/vecchio", allow_private=True)
    assert r.error is None
    assert r.status_code == 200
    assert r.redirects == 2
    assert r.final_url == f"{server}/pagina"
    assert r.size_bytes == len(PAGE)
    assert r.wait_ms is not None and r.wait_ms >= 50
    # le parti tornano col totale (a meno degli arrotondamenti al millisecondo)
    assert abs(r.redirect_ms + r.wait_ms + r.download_ms - r.total_ms) <= 2


def test_senza_redirect(server):
    r = probe.measure(f"{server}/pagina", allow_private=True)
    assert r.status_code == 200 and r.redirects == 0
    assert r.redirect_ms <= 5


def test_errore_http_resta_un_codice(server):
    r = probe.measure(f"{server}/manca", allow_private=True)
    assert r.status_code == 404 and r.error is None


def test_troppi_redirect_si_fermano(server):
    r = probe.measure(f"{server}/giro", allow_private=True)
    # come curl --max-redirs 5: dopo cinque passaggi si tiene l'ultima risposta
    assert r.redirects == probe.MAX_REDIRECTS
    assert r.status_code == 302


def test_reti_private_rifiutate(server):
    r = probe.measure(f"{server}/pagina")
    assert r.status_code is None
    assert "non pubblico" in r.error


def test_indirizzo_che_non_risponde():
    r = probe.measure("http://nome-che-non-esiste.invalid/", timeout=3)
    assert r.status_code is None and r.error


def test_endpoint_chiede_il_token(client):
    assert client.post("/probe", json={"urls": ["https://example.com"]}).status_code == 401


def test_endpoint_non_apre_la_rete_interna(client, auth, server):
    res = client.post("/probe", json={"urls": [f"{server}/pagina"]}, headers=auth)
    assert res.status_code == 200
    body = res.json()
    assert body["origin"] == "locale"
    assert body["results"][0]["status_code"] is None
    assert "non pubblico" in body["results"][0]["error"]


def test_endpoint_rifiuta_schemi_strani(client, auth):
    res = client.post("/probe", json={"urls": ["file:///etc/passwd"]}, headers=auth)
    assert res.status_code == 422
