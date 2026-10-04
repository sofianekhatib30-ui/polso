-- Dati per il badge: nome del sito e uptime degli ultimi N giorni.
-- Parametri: %(site_id)s, %(days)s
SELECT
    s.name,
    round(100.0 * count(c.id) FILTER (WHERE c.is_up) / nullif(count(c.id), 0), 2) AS uptime
FROM sites s
LEFT JOIN checks c
       ON c.site_id = s.id
      AND c.checked_at > now() - make_interval(days => %(days)s)
WHERE s.id = %(site_id)s AND s.active
GROUP BY s.id;
