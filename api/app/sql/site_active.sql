-- Il sito esiste ed è attivo?
-- Parametri: %(site_id)s
SELECT id FROM sites WHERE id = %(site_id)s AND active;
