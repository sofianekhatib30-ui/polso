-- Restituisce l'id del sito con quell'URL, creandolo se non esiste.
-- Parametri: %(url)s, %(name)s
INSERT INTO sites (url, name)
VALUES (%(url)s, %(name)s)
ON CONFLICT (url) DO UPDATE SET active = TRUE
RETURNING id;
