-- Panoramica dei siti attivi: ultimo controllo, uptime, p95, giorni alla scadenza SSL.
-- Il p95 usa solo i tempi misurati dallo stesso posto dell'ultima misura (timing_origin):
-- tempi presi dagli Stati Uniti e da Francoforte mescolati non descrivono nessuno dei due.
-- Parametri: %(client)s (slug del cliente, NULL = tutti i siti)
SELECT
    s.id,
    s.name,
    s.url,
    s.client_name,
    s.icon_url,
    s.client_slug,
    s.keyword,
    ultimo.checked_at                            AS last_checked_at,
    ultimo.is_up,
    ultimo.status_code,
    ultimo.response_ms,
    st.uptime_24h,
    st.uptime_7d,
    st.uptime_30d,
    round(st.p95_ms_24h)::int                    AS p95_ms_24h,
    st.samples_24h,
    -- giorni interi che mancano alla scadenza del certificato (negativo = già scaduto)
    floor(extract(epoch FROM ssl.ssl_expires_at - now()) / 86400)::int AS ssl_days_left,
    floor(extract(epoch FROM s.domain_expires_at - now()) / 86400)::int AS domain_days_left,
    ultimo.security_headers,
    EXISTS (
        SELECT 1 FROM incidents i
        WHERE i.site_id = s.id AND i.resolved_at IS NULL
    )                                            AS open_incident
FROM sites s
-- LATERAL: per ogni sito prende solo il controllo più recente, usando l'indice (site_id, checked_at DESC)
LEFT JOIN LATERAL (
    SELECT c.checked_at, c.is_up, c.status_code, c.response_ms, c.security_headers
    FROM checks c
    WHERE c.site_id = s.id
    ORDER BY c.checked_at DESC
    LIMIT 1
) AS ultimo ON TRUE
-- da dove arriva l'ultima misura dei tempi (NULL = dal checker su GitHub, prima di Francoforte)
LEFT JOIN LATERAL (
    SELECT c.timing_origin
    FROM checks c
    WHERE c.site_id = s.id AND c.response_ms IS NOT NULL
    ORDER BY c.checked_at DESC
    LIMIT 1
) AS orig ON TRUE
LEFT JOIN LATERAL (
    SELECT
        -- FILTER conta solo le righe della finestra di tempo indicata
        round(100.0 * count(*) FILTER (WHERE c.is_up AND c.checked_at > now() - interval '24 hours')
              / nullif(count(*) FILTER (WHERE c.checked_at > now() - interval '24 hours'), 0), 2) AS uptime_24h,
        round(100.0 * count(*) FILTER (WHERE c.is_up AND c.checked_at > now() - interval '7 days')
              / nullif(count(*) FILTER (WHERE c.checked_at > now() - interval '7 days'), 0), 2)   AS uptime_7d,
        round(100.0 * count(*) FILTER (WHERE c.is_up)
              / nullif(count(*), 0), 2)                                                              AS uptime_30d,
        -- 95° percentile: 95 risposte su 100 è più veloce di questo valore
        percentile_cont(0.95) WITHIN GROUP (ORDER BY c.response_ms)
            FILTER (WHERE c.checked_at > now() - interval '24 hours'
                      AND c.timing_origin IS NOT DISTINCT FROM orig.timing_origin)                  AS p95_ms_24h,
        -- quanti tempi misurati nelle 24 ore: con pochi controlli il p95 coincide quasi con il peggiore
        count(c.response_ms) FILTER (WHERE c.checked_at > now() - interval '24 hours'
                                       AND c.timing_origin IS NOT DISTINCT FROM orig.timing_origin) AS samples_24h
    FROM checks c
    WHERE c.site_id = s.id
      AND c.checked_at > now() - interval '30 days'
) AS st ON TRUE
LEFT JOIN LATERAL (
    SELECT c.ssl_expires_at
    FROM checks c
    WHERE c.site_id = s.id AND c.ssl_expires_at IS NOT NULL
    ORDER BY c.checked_at DESC
    LIMIT 1
) AS ssl ON TRUE
WHERE s.active
  AND (%(client)s::text IS NULL OR s.client_slug = %(client)s::text)
ORDER BY s.name;
