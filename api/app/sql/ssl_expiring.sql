-- Siti con certificato SSL in scadenza entro N giorni.
-- Parametri: %(days)s
SELECT s.id, s.name, s.url, ultimo.ssl_expires_at,
       floor(extract(epoch FROM ultimo.ssl_expires_at - now()) / 86400)::int AS days_left
FROM sites s
JOIN LATERAL (
    SELECT c.ssl_expires_at
    FROM checks c
    WHERE c.site_id = s.id AND c.ssl_expires_at IS NOT NULL
    ORDER BY c.checked_at DESC
    LIMIT 1
) AS ultimo ON TRUE
WHERE s.active
  AND ultimo.ssl_expires_at < now() + make_interval(days => %(days)s)
ORDER BY ultimo.ssl_expires_at;
