-- Andamento orario di un sito nelle ultime N ore (per il grafico).
-- Parametri: %(site_id)s, %(hours)s
-- generate_series crea TUTTE le ore, anche quelle senza controlli:
-- così nel grafico un buco resta un buco e non viene "saltato".
SELECT
    ore.ora                                                  AS hour,
    count(c.id)                                              AS checks,
    round(avg(c.response_ms))::int                           AS avg_ms,
    min(c.response_ms)                                       AS min_ms,
    max(c.response_ms)                                       AS max_ms,
    round(100.0 * count(*) FILTER (WHERE c.is_up) / nullif(count(c.id), 0), 2) AS uptime
FROM generate_series(
        date_trunc('hour', now()) - make_interval(hours => %(hours)s - 1),
        date_trunc('hour', now()),
        interval '1 hour'
     ) AS ore(ora)
LEFT JOIN checks c
       ON c.site_id = %(site_id)s
      AND c.checked_at >= ore.ora
      AND c.checked_at <  ore.ora + interval '1 hour'
GROUP BY ore.ora
ORDER BY ore.ora;
