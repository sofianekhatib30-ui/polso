-- Incidenti, dal più recente, con durata. Filtro per sito facoltativo.
-- Parametri: %(site_id)s (NULL = tutti), %(client)s (slug, NULL = tutti), %(limit)s
SELECT
    i.id,
    i.site_id,
    s.name  AS site_name,
    s.url   AS site_url,
    i.started_at,
    i.resolved_at,
    i.cause,
    -- durata in minuti; per gli incidenti aperti conta fino ad adesso
    round(extract(epoch FROM coalesce(i.resolved_at, now()) - i.started_at) / 60)::int AS duration_min
FROM incidents i
JOIN sites s ON s.id = i.site_id
-- solo siti attivi: quelli tolti dalla lista non sono pubblici
WHERE s.active
  AND (%(site_id)s::int IS NULL OR i.site_id = %(site_id)s::int)
  AND (%(client)s::text IS NULL OR s.client_slug = %(client)s::text)
ORDER BY i.started_at DESC
LIMIT %(limit)s;
