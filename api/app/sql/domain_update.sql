-- Salva la scadenza del dominio letta dal checker (una volta al giorno).
-- COALESCE: se oggi il registro non ha risposto, si tiene la scadenza già nota.
-- Parametri: %(url)s, %(domain)s, %(expires_at)s, %(registrar)s
UPDATE sites
SET domain            = %(domain)s,
    domain_expires_at = COALESCE(%(expires_at)s, domain_expires_at),
    domain_registrar  = COALESCE(%(registrar)s, domain_registrar),
    domain_checked_at = now()
WHERE url = %(url)s
RETURNING id;
