-- Apre un incidente. ON CONFLICT sull'indice unico parziale: se un altro
-- processo l'ha appena aperto, non ne crea un secondo.
-- Parametri: %(site_id)s, %(started_at)s, %(cause)s
INSERT INTO incidents (site_id, started_at, cause)
VALUES (%(site_id)s, %(started_at)s, %(cause)s)
ON CONFLICT (site_id) WHERE resolved_at IS NULL DO NOTHING
RETURNING id;
