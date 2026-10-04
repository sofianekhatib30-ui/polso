-- Salva un controllo.
-- Parametri: %(site_id)s, %(checked_at)s, %(is_up)s, %(status_code)s, %(response_ms)s, %(ssl_expires_at)s,
--            %(error)s, %(security_headers)s
INSERT INTO checks (site_id, checked_at, is_up, status_code, response_ms, ssl_expires_at, error, security_headers)
VALUES (%(site_id)s, %(checked_at)s, %(is_up)s, %(status_code)s, %(response_ms)s, %(ssl_expires_at)s,
        %(error)s, %(security_headers)s)
RETURNING id;
