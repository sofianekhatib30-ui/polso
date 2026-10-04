-- Incidenti che toccano il mese del report, dal più vecchio (si legge come un diario).
-- Parametri: %(month)s (primo giorno del mese), %(client)s (slug, NULL = tutti)
WITH periodo AS (
    SELECT
        (%(month)s::date)::timestamp AT TIME ZONE 'Europe/Rome'                                   AS inizio,
        least(((%(month)s::date + interval '1 month')::timestamp) AT TIME ZONE 'Europe/Rome', now()) AS fine
)
SELECT
    i.id,
    i.site_id,
    s.name AS site_name,
    s.url  AS site_url,
    i.started_at,
    i.resolved_at,
    i.cause,
    round(extract(epoch FROM coalesce(i.resolved_at, now()) - i.started_at) / 60)::int AS duration_min
FROM incidents i
JOIN sites s ON s.id = i.site_id
CROSS JOIN periodo p
WHERE s.active
  AND (%(client)s::text IS NULL OR s.client_slug = %(client)s::text)
  AND i.started_at < p.fine
  AND coalesce(i.resolved_at, now()) > p.inizio
ORDER BY i.started_at;
