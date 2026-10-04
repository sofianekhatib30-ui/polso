-- Chiude un incidente.
-- Parametri: %(id)s, %(resolved_at)s
UPDATE incidents
SET resolved_at = %(resolved_at)s
WHERE id = %(id)s AND resolved_at IS NULL
RETURNING id;
