-- Disattiva i siti attivi che non sono nella lista appena controllata.
-- Non cancella niente: controlli e incidenti restano, e il sito torna attivo
-- da solo (upsert_site) se riappare nella lista.
-- Parametri: %(urls)s (array di URL)
UPDATE sites
SET active = FALSE
WHERE active
  AND NOT (url = ANY(%(urls)s))
RETURNING id;
