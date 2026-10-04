-- Salva l'ultima soglia di scadenza avvisata.
-- Parametri: %(id)s, %(ssl_bucket)s, %(domain_bucket)s
UPDATE sites
SET ssl_alert_bucket = %(ssl_bucket)s,
    domain_alert_bucket = %(domain_bucket)s
WHERE id = %(id)s;
