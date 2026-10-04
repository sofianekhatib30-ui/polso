-- Dati di esempio: 3 siti finti (dominio example.com, riservato agli esempi)
-- e 30 giorni di controlli orari, con un disservizio di 3 ore.
-- Si può rieseguire: prima cancella i dati di esempio.

SELECT setseed(0.42);  -- numeri casuali sempre uguali a ogni esecuzione

DELETE FROM sites WHERE url LIKE 'https://%.example.com';

INSERT INTO sites (name, url) VALUES
    ('Negozio di esempio',     'https://negozio.example.com'),
    ('Studio di esempio',      'https://studio.example.com'),
    ('Fondazione di esempio',  'https://fondazione.example.com');

-- Un controllo all'ora per 30 giorni, per ogni sito.
-- generate_series crea le ore, CROSS JOIN le combina con i siti.
INSERT INTO checks (site_id, checked_at, is_up, status_code, response_ms, ssl_expires_at, error)
SELECT
    s.id,
    ore.t,
    NOT giu,
    CASE WHEN giu THEN NULL ELSE 200 END,
    CASE WHEN giu THEN NULL
         -- tempo base diverso per sito + rumore casuale
         ELSE (CASE s.name WHEN 'Negozio di esempio' THEN 420
                           WHEN 'Studio di esempio'  THEN 180
                           ELSE 260 END
               + (random() * 160)::int)
    END,
    CASE s.name WHEN 'Fondazione di esempio' THEN date_trunc('day', now()) + interval '12 days'
                ELSE date_trunc('day', now()) + interval '75 days' END,
    CASE WHEN giu THEN 'curl: (28) Operation timed out' ELSE NULL END
FROM sites s
CROSS JOIN generate_series(
    date_trunc('hour', now()) - interval '30 days',
    date_trunc('hour', now()) - interval '1 hour',
    interval '1 hour'
) AS ore(t)
-- il Negozio è giù per 3 ore, 6 giorni fa
CROSS JOIN LATERAL (
    SELECT s.name = 'Negozio di esempio'
       AND ore.t >= date_trunc('hour', now()) - interval '6 days'
       AND ore.t <  date_trunc('hour', now()) - interval '6 days' + interval '3 hours' AS giu
) AS stato
WHERE s.url LIKE 'https://%.example.com';

-- L'incidente corrispondente, già chiuso.
INSERT INTO incidents (site_id, started_at, resolved_at, cause)
SELECT id,
       date_trunc('hour', now()) - interval '6 days',
       date_trunc('hour', now()) - interval '6 days' + interval '3 hours',
       'curl: (28) Operation timed out'
FROM sites WHERE name = 'Negozio di esempio' AND url LIKE 'https://%.example.com';
