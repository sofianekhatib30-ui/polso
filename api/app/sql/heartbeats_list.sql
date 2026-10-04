-- Attività programmate attive con il loro stato:
--   waiting = non ha ancora mai dato segni di vita
--   late    = l'ultimo segno di vita è più vecchio di periodo + tolleranza
--   ok      = in regola
-- Parametri: nessuno.
SELECT
    h.slug,
    h.name,
    h.period_min,
    h.grace_min,
    h.last_ping_at,
    h.last_ping_at + make_interval(mins => h.period_min)                    AS next_due_at,
    CASE
        WHEN h.last_ping_at IS NULL THEN 'waiting'
        WHEN now() > h.last_ping_at + make_interval(mins => h.period_min + h.grace_min) THEN 'late'
        ELSE 'ok'
    END                                                                      AS status,
    (SELECT count(*) FROM heartbeat_pings p
      WHERE p.heartbeat_id = h.id AND p.pinged_at > now() - interval '30 days') AS pings_30d
FROM heartbeats h
WHERE h.active
ORDER BY h.name;
