-- Scadenze dei siti attivi e ultima soglia avvisata, per gli avvisi di scadenza.
-- FOR UPDATE OF s: due richieste contemporanee non mandano lo stesso avviso due volte.
-- Parametri: nessuno.
SELECT
    s.id,
    s.name,
    s.url,
    s.domain,
    s.domain_registrar,
    floor(extract(epoch FROM ssl.ssl_expires_at - now()) / 86400)::int AS ssl_days_left,
    floor(extract(epoch FROM s.domain_expires_at - now()) / 86400)::int AS domain_days_left,
    s.ssl_alert_bucket,
    s.domain_alert_bucket
FROM sites s
LEFT JOIN LATERAL (
    SELECT c.ssl_expires_at
    FROM checks c
    WHERE c.site_id = s.id AND c.ssl_expires_at IS NOT NULL
    ORDER BY c.checked_at DESC
    LIMIT 1
) AS ssl ON TRUE
WHERE s.active
FOR UPDATE OF s;
