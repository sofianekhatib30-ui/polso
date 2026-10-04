-- Il cliente esiste (ha almeno un sito attivo)? Restituisce il suo nome.
-- Parametri: %(client)s
SELECT min(client_name) AS name
FROM sites
WHERE active AND client_slug = %(client)s
HAVING count(*) > 0;
