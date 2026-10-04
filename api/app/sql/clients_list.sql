-- Clienti con almeno un sito attivo, con uptime complessivo degli ultimi 30 giorni.
-- L'uptime è controlli riusciti / controlli fatti su tutti i siti del cliente (non una media di percentuali).
-- Parametri: nessuno.
SELECT
    s.client_slug                                                          AS slug,
    min(s.client_name)                                                     AS name,
    count(DISTINCT s.id)                                                   AS sites,
    round(100.0 * count(c.id) FILTER (WHERE c.is_up) / nullif(count(c.id), 0), 2) AS uptime_30d
FROM sites s
LEFT JOIN checks c
       ON c.site_id = s.id
      AND c.checked_at > now() - interval '30 days'
WHERE s.active
  AND s.client_slug IS NOT NULL
GROUP BY s.client_slug
ORDER BY min(s.client_name);
