-- Polso: schema del database (PostgreSQL 15+)
--
-- Tre tabelle:
--   sites      i siti da controllare
--   checks     un controllo = una riga (ogni ora per ogni sito)
--   incidents  periodi in cui un sito è risultato giù

CREATE TABLE IF NOT EXISTS sites (
    id          SERIAL PRIMARY KEY,
    name        TEXT        NOT NULL,
    url         TEXT        NOT NULL UNIQUE,
    active      BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- accettiamo solo indirizzi http(s), niente spazi
    CONSTRAINT sites_url_formato CHECK (url ~ '^https?://[^\s]+$')
);

CREATE TABLE IF NOT EXISTS checks (
    id              BIGSERIAL   PRIMARY KEY,
    site_id         INTEGER     NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    checked_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    is_up           BOOLEAN     NOT NULL,
    status_code     INTEGER,            -- NULL se il sito non ha risposto
    response_ms     INTEGER,            -- tempo totale della richiesta
    ssl_expires_at  TIMESTAMPTZ,        -- scadenza del certificato, se leggibile
    error           TEXT,               -- messaggio di errore di curl/openssl
    CONSTRAINT checks_status_valido CHECK (status_code IS NULL OR status_code BETWEEN 100 AND 599),
    CONSTRAINT checks_tempo_valido  CHECK (response_ms IS NULL OR response_ms >= 0)
);

-- Quasi tutte le query leggono "gli ultimi controlli di un sito":
-- questo indice le rende veloci anche con anni di storico.
CREATE INDEX IF NOT EXISTS checks_sito_data_idx ON checks (site_id, checked_at DESC);

CREATE TABLE IF NOT EXISTS incidents (
    id           BIGSERIAL   PRIMARY KEY,
    site_id      INTEGER     NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    started_at   TIMESTAMPTZ NOT NULL,
    resolved_at  TIMESTAMPTZ,           -- NULL = incidente ancora aperto
    cause        TEXT,
    CONSTRAINT incidents_date_coerenti CHECK (resolved_at IS NULL OR resolved_at >= started_at)
);

-- Al massimo UN incidente aperto per sito: lo garantisce il database,
-- non solo il codice Python (indice unico parziale).
CREATE UNIQUE INDEX IF NOT EXISTS incidents_uno_aperto_per_sito
    ON incidents (site_id) WHERE resolved_at IS NULL;

CREATE INDEX IF NOT EXISTS incidents_sito_data_idx ON incidents (site_id, started_at DESC);

-- ---------------------------------------------------------------------------
-- Aggiunte successive su un database già in uso.
-- Non usiamo "ALTER TABLE ... ADD COLUMN IF NOT EXISTS": prende un lock esclusivo
-- sulla tabella anche quando la colonna c'è già, e lo schema gira a ogni avvio dell'API.
-- Qui si guarda prima il catalogo e si fa l'ALTER solo se la colonna manca davvero.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    c record;
BEGIN
    FOR c IN
        SELECT * FROM (VALUES
            -- cliente a cui appartiene il sito (pagina di stato e report mensile)
            ('sites',  'client_name',       'TEXT'),
            ('sites',  'client_slug',       'TEXT'),
            -- testo che deve comparire nella pagina perché il sito conti come "su"
            ('sites',  'keyword',           'TEXT'),
            -- scadenza del dominio, letta una volta al giorno (RDAP o whois)
            ('sites',  'domain',            'TEXT'),
            ('sites',  'domain_expires_at', 'TIMESTAMPTZ'),
            ('sites',  'domain_registrar',  'TEXT'),
            ('sites',  'domain_checked_at', 'TIMESTAMPTZ'),
            -- header di sicurezza presenti nella risposta (es. {hsts,csp,nosniff})
            ('checks', 'security_headers',  'TEXT[]'),
            -- icona (favicon) del sito, letta dalla pagina: serve per riconoscerlo a colpo d'occhio
            ('sites',  'icon_url',          'TEXT'),
            -- ultima soglia di scadenza già avvisata (vedi app/expiry.py): un avviso per soglia
            ('sites',  'ssl_alert_bucket',    'INTEGER'),
            ('sites',  'domain_alert_bucket', 'INTEGER'),
            -- dove va il tempo di risposta: redirect, attesa del server, download; peso della pagina
            ('checks', 'redirect_ms', 'INTEGER'),
            ('checks', 'wait_ms',     'INTEGER'),
            ('checks', 'download_ms', 'INTEGER'),
            ('checks', 'size_bytes',  'INTEGER'),
            ('checks', 'redirects',   'INTEGER')
        ) AS v(tab, col, typ)
    LOOP
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = current_schema() AND table_name = c.tab AND column_name = c.col
        ) THEN
            EXECUTE 'ALTER TABLE ' || quote_ident(c.tab) || ' ADD COLUMN ' || quote_ident(c.col) || ' ' || c.typ;
        END IF;
    END LOOP;
END
$$;

CREATE INDEX IF NOT EXISTS sites_cliente_idx ON sites (client_slug) WHERE active;

-- Attività programmate (backup, script notturni, il controllo dei domini...):
-- devono "dare segni di vita" chiamando /ping/{slug} almeno ogni period_min minuti.
CREATE TABLE IF NOT EXISTS heartbeats (
    id            SERIAL PRIMARY KEY,
    slug          TEXT        NOT NULL UNIQUE,
    name          TEXT        NOT NULL,
    period_min    INTEGER     NOT NULL,
    grace_min     INTEGER     NOT NULL DEFAULT 0,
    active        BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_ping_at  TIMESTAMPTZ,
    -- TRUE dopo l'avviso di ritardo, così l'avviso parte una volta sola
    late_alerted  BOOLEAN     NOT NULL DEFAULT FALSE,
    CONSTRAINT heartbeats_slug_formato CHECK (slug ~ '^[a-z0-9][a-z0-9-]{0,59}$'),
    CONSTRAINT heartbeats_periodo_valido CHECK (period_min BETWEEN 1 AND 60 * 24 * 31 AND grace_min >= 0)
);

CREATE TABLE IF NOT EXISTS heartbeat_pings (
    id            BIGSERIAL   PRIMARY KEY,
    heartbeat_id  INTEGER     NOT NULL REFERENCES heartbeats(id) ON DELETE CASCADE,
    pinged_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS heartbeat_pings_idx ON heartbeat_pings (heartbeat_id, pinged_at DESC);
