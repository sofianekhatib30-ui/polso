-- Segna come "avvisate" le attività in ritardo non ancora segnalate e le restituisce:
-- l'avviso parte una volta sola per ritardo. Le attività mai partite non contano come ritardo.
-- Parametri: nessuno.
UPDATE heartbeats
SET late_alerted = TRUE
WHERE active
  AND NOT late_alerted
  AND last_ping_at IS NOT NULL
  AND now() > last_ping_at + make_interval(mins => period_min + grace_min)
RETURNING slug, name, last_ping_at;
