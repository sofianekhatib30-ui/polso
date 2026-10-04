-- Disattiva le attività che non sono più nella lista inviata.
-- Parametri: %(slugs)s (array di slug)
UPDATE heartbeats SET active = FALSE
WHERE active AND NOT (slug = ANY(%(slugs)s))
RETURNING id;
