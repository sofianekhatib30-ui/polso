-- Statistiche di un singolo sito.
-- Tempi (media, p50, p95) solo dallo stesso posto dell'ultima misura: vedi sites_overview.sql.
-- Parametri: %(site_id)s
SELECT
    s.id,
    s.name,
    s.url,
    s.created_at,
    s.client_name,
    s.icon_url,
    s.client_slug,
    s.keyword,
    s.domain,
    s.domain_expires_at,
    s.domain_registrar,
    s.domain_checked_at,
    count(c.id)                                                        AS checks_30d,
    round(100.0 * count(*) FILTER (WHERE c.is_up) / nullif(count(c.id), 0), 2) AS uptime_30d,
    round(avg(c.response_ms) FILTER (WHERE c.checked_at > now() - interval '7 days' AND c.timing_origin IS NOT DISTINCT FROM orig.timing_origin))::int AS avg_ms_7d,
    round(percentile_cont(0.50) WITHIN GROUP (ORDER BY c.response_ms)
          FILTER (WHERE c.checked_at > now() - interval '7 days'
                    AND c.timing_origin IS NOT DISTINCT FROM orig.timing_origin))::int AS p50_ms_7d,
    round(percentile_cont(0.95) WITHIN GROUP (ORDER BY c.response_ms)
          FILTER (WHERE c.checked_at > now() - interval '7 days'
                    AND c.timing_origin IS NOT DISTINCT FROM orig.timing_origin))::int AS p95_ms_7d,
    max(c.checked_at)                                                  AS last_checked_at
FROM sites s
LEFT JOIN checks c
       ON c.site_id = s.id
      AND c.checked_at > now() - interval '30 days'
LEFT JOIN LATERAL (
    SELECT c2.timing_origin
    FROM checks c2
    WHERE c2.site_id = s.id AND c2.response_ms IS NOT NULL
    ORDER BY c2.checked_at DESC
    LIMIT 1
) AS orig ON TRUE
WHERE s.id = %(site_id)s
  AND s.active  -- i siti tolti dalla lista non sono pubblici
GROUP BY s.id, orig.timing_origin;
