-- Salva un controllo.
-- Parametri: %(site_id)s, %(checked_at)s, %(is_up)s, %(status_code)s, %(response_ms)s, %(ssl_expires_at)s,
--            %(error)s, %(security_headers)s, %(redirect_ms)s, %(wait_ms)s, %(download_ms)s, %(size_bytes)s, %(redirects)s
INSERT INTO checks (site_id, checked_at, is_up, status_code, response_ms, ssl_expires_at, error, security_headers,
                    redirect_ms, wait_ms, download_ms, size_bytes, redirects)
VALUES (%(site_id)s, %(checked_at)s, %(is_up)s, %(status_code)s, %(response_ms)s, %(ssl_expires_at)s,
        %(error)s, %(security_headers)s,
        %(redirect_ms)s, %(wait_ms)s, %(download_ms)s, %(size_bytes)s, %(redirects)s)
RETURNING id;
