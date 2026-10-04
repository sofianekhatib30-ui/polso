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
