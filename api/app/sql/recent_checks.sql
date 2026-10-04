-- Gli ultimi N controlli di un sito, dal più recente (servono per decidere gli incidenti).
-- Parametri: %(site_id)s, %(limit)s
SELECT checked_at, is_up, error
FROM checks
WHERE site_id = %(site_id)s
ORDER BY checked_at DESC
LIMIT %(limit)s;
