-- Uptime giorno per giorno degli ultimi N giorni, per le "strisce del polso".
-- I giorni sono quelli del calendario di Roma, non di Greenwich.
-- Ogni giorno compare anche se non ha controlli (checks = 0): nella striscia
-- diventa grigio "nessun dato", invece di essere contato come online.
-- Parametri: %(days)s, %(site_id)s (NULL = tutti i siti attivi), %(client)s (slug, NULL = tutti)
SELECT
    s.id                                                            AS site_id,
    g.giorno::date                                                  AS day,
    count(c.id)                                                     AS checks,
    count(c.id) FILTER (WHERE c.is_up)                              AS up,
    round(100.0 * count(c.id) FILTER (WHERE c.is_up) / nullif(count(c.id), 0), 2) AS uptime
FROM sites s
CROSS JOIN generate_series(
    (now() AT TIME ZONE 'Europe/Rome')::date - (%(days)s::int - 1),
    (now() AT TIME ZONE 'Europe/Rome')::date,
    interval '1 day'
) AS g(giorno)
-- intervallo [mezzanotte, mezzanotte del giorno dopo) in ora di Roma, convertito in istanti:
-- così l'indice (site_id, checked_at) viene usato
LEFT JOIN checks c
       ON c.site_id = s.id
      AND c.checked_at >= (g.giorno AT TIME ZONE 'Europe/Rome')
      AND c.checked_at <  ((g.giorno + interval '1 day') AT TIME ZONE 'Europe/Rome')
WHERE s.active
  AND (%(site_id)s::int IS NULL OR s.id = %(site_id)s::int)
  AND (%(client)s::text IS NULL OR s.client_slug = %(client)s::text)
GROUP BY s.id, g.giorno
ORDER BY s.id, g.giorno;
