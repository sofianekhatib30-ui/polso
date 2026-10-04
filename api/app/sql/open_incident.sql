-- L'incidente aperto di un sito, se c'è. FOR UPDATE blocca la riga fino alla fine
-- della transazione: due richieste in parallelo non possono chiuderlo due volte.
-- Parametri: %(site_id)s
SELECT id, started_at
FROM incidents
WHERE site_id = %(site_id)s AND resolved_at IS NULL
FOR UPDATE;
