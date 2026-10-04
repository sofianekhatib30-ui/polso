-- Registra un "segno di vita". Restituisce se l'attività era stata segnalata in ritardo,
-- così l'API può avvisare che è ripartita. FOR UPDATE evita due ping contemporanei che si pestano i piedi.
-- Parametri: %(slug)s
WITH hb AS (
    SELECT id, name, late_alerted
    FROM heartbeats
    WHERE slug = %(slug)s AND active
    FOR UPDATE
), ping AS (
    INSERT INTO heartbeat_pings (heartbeat_id)
    SELECT id FROM hb
    RETURNING pinged_at
)
UPDATE heartbeats h
SET last_ping_at = (SELECT pinged_at FROM ping),
    late_alerted = FALSE
FROM hb
WHERE h.id = hb.id
RETURNING h.id, h.name, h.last_ping_at, hb.late_alerted AS was_late;
