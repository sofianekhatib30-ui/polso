-- Restituisce l'id del sito con quell'URL, creandolo se non esiste.
-- Se il checker manda un nome, lo aggiorna (così un nome cambiato in sites.txt arriva in dashboard).
-- Cliente e parola chiave arrivano dal file dei siti: sono sempre quelli dell'ultimo invio.
-- Parametri: %(url)s, %(name)s (nome da usare alla creazione), %(given_name)s (nome inviato, può essere NULL),
--            %(client_name)s, %(client_slug)s, %(keyword)s, %(icon_url)s (NULL = tieni quella nota)
INSERT INTO sites (url, name, client_name, client_slug, keyword, icon_url)
VALUES (%(url)s, %(name)s, %(client_name)s, %(client_slug)s, %(keyword)s, %(icon_url)s)
ON CONFLICT (url) DO UPDATE
SET active      = TRUE,
    name        = COALESCE(%(given_name)s, sites.name),
    client_name = EXCLUDED.client_name,
    client_slug = EXCLUDED.client_slug,
    keyword     = EXCLUDED.keyword,
    -- se il sito oggi è giù non leggiamo l'icona: resta quella dell'ultima volta
    icon_url    = COALESCE(EXCLUDED.icon_url, sites.icon_url)
RETURNING id;
