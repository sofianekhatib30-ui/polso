-- Crea o aggiorna un'attività programmata.
-- Parametri: %(slug)s, %(name)s, %(period_min)s, %(grace_min)s
INSERT INTO heartbeats (slug, name, period_min, grace_min)
VALUES (%(slug)s, %(name)s, %(period_min)s, %(grace_min)s)
ON CONFLICT (slug) DO UPDATE
SET name       = EXCLUDED.name,
    period_min = EXCLUDED.period_min,
    grace_min  = EXCLUDED.grace_min,
    active     = TRUE
RETURNING id;
