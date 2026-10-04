-- Cambi di stato di un sito (su -> giù e giù -> su), dal più recente.
-- Parametri: %(site_id)s, %(limit)s
-- LAG legge il valore della riga precedente nella stessa "finestra" (stesso sito, ordine di tempo):
-- una riga è un cambio di stato quando is_up è diverso da quello del controllo prima.
SELECT checked_at, is_up, status_code, error
FROM (
    SELECT
        c.checked_at,
        c.is_up,
        c.status_code,
        c.error,
        LAG(c.is_up) OVER (PARTITION BY c.site_id ORDER BY c.checked_at) AS era_up
    FROM checks c
    WHERE c.site_id = %(site_id)s
) AS storico
WHERE era_up IS DISTINCT FROM is_up
  AND era_up IS NOT NULL
ORDER BY checked_at DESC
LIMIT %(limit)s;
