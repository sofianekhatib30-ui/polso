-- Report di un mese, sito per sito. Il mese è quello del calendario di Roma;
-- per il mese in corso i conti arrivano fino ad adesso.
-- Parametri: %(month)s (primo giorno del mese, date), %(client)s (slug, NULL = tutti)
WITH periodo AS (
    SELECT
        (%(month)s::date)::timestamp AT TIME ZONE 'Europe/Rome'                                   AS inizio,
        least(((%(month)s::date + interval '1 month')::timestamp) AT TIME ZONE 'Europe/Rome', now()) AS fine
)
SELECT
    s.id,
    s.name,
    s.url,
    s.client_name,
    s.icon_url,
    s.client_slug,
    count(c.id)                                                                  AS checks,
    count(c.id) FILTER (WHERE c.is_up)                                           AS up,
    round(100.0 * count(c.id) FILTER (WHERE c.is_up) / nullif(count(c.id), 0), 3) AS uptime,
    round(percentile_cont(0.50) WITHIN GROUP (ORDER BY c.response_ms))::int      AS p50_ms,
    round(percentile_cont(0.95) WITHIN GROUP (ORDER BY c.response_ms))::int      AS p95_ms,
    inc.incidents,
    inc.downtime_min,
    inc.longest_min
FROM sites s
CROSS JOIN periodo p
LEFT JOIN checks c
       ON c.site_id = s.id
      AND c.checked_at >= p.inizio
      AND c.checked_at <  p.fine
-- incidenti che si sovrappongono al mese: si conta solo la parte dentro il mese
LEFT JOIN LATERAL (
    SELECT
        count(*)                                                                         AS incidents,
        coalesce(round(sum(extract(epoch FROM least(coalesce(i.resolved_at, now()), p.fine)
                                             - greatest(i.started_at, p.inizio))) / 60), 0)::int AS downtime_min,
        coalesce(round(max(extract(epoch FROM least(coalesce(i.resolved_at, now()), p.fine)
                                             - greatest(i.started_at, p.inizio))) / 60), 0)::int AS longest_min
    FROM incidents i
    WHERE i.site_id = s.id
      AND i.started_at < p.fine
      AND coalesce(i.resolved_at, now()) > p.inizio
) AS inc ON TRUE
WHERE s.active
  AND (%(client)s::text IS NULL OR s.client_slug = %(client)s::text)
GROUP BY s.id, inc.incidents, inc.downtime_min, inc.longest_min
ORDER BY s.client_name NULLS LAST, s.name;
