-- Restituisce l'id del sito con quell'URL, creandolo se non esiste.
-- Se il checker manda un nome, lo aggiorna (così un nome cambiato in sites.txt arriva in dashboard).
-- Parametri: %(url)s, %(name)s (nome da usare alla creazione), %(given_name)s (nome inviato, può essere NULL)
INSERT INTO sites (url, name)
VALUES (%(url)s, %(name)s)
ON CONFLICT (url) DO UPDATE
SET active = TRUE,
    name   = COALESCE(%(given_name)s, sites.name)
RETURNING id;
