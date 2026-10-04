-- Dove va il tempo di risposta di un sito: mediana delle ultime 24 ore e ultimo controllo.
-- Mediana (non media) per parte: un solo controllo lento non deve falsare il quadro.
-- Solo i controlli misurati dallo stesso posto dell'ultimo (timing_origin): mescolare tempi presi
-- dagli Stati Uniti e da Francoforte darebbe una mediana che non descrive nessuno dei due.
-- Parametri: %(site_id)s
WITH misurati AS (
    SELECT *
    FROM checks
    WHERE site_id = %(site_id)s
      AND is_up
      AND wait_ms IS NOT NULL
      AND checked_at > now() - interval '24 hours'
), ultimo AS (
    SELECT redirect_ms, wait_ms, download_ms, size_bytes, redirects, response_ms, checked_at, timing_origin
    FROM misurati
    ORDER BY checked_at DESC
    LIMIT 1
), recenti AS (
    SELECT m.* FROM misurati m, ultimo u
    WHERE m.timing_origin IS NOT DISTINCT FROM u.timing_origin
)
SELECT
    (SELECT count(*) FROM recenti)                                                         AS samples,
    (SELECT round(percentile_cont(0.5) WITHIN GROUP (ORDER BY redirect_ms))::int FROM recenti) AS redirect_ms,
    (SELECT round(percentile_cont(0.5) WITHIN GROUP (ORDER BY wait_ms))::int FROM recenti)     AS wait_ms,
    (SELECT round(percentile_cont(0.5) WITHIN GROUP (ORDER BY download_ms))::int FROM recenti) AS download_ms,
    (SELECT round(percentile_cont(0.5) WITHIN GROUP (ORDER BY size_bytes))::int FROM recenti)  AS size_bytes,
    (SELECT max(redirects) FROM recenti)                                                    AS redirects,
    (SELECT timing_origin FROM ultimo)                                                      AS origin,
    (SELECT to_jsonb(u) - 'timing_origin' FROM ultimo u)                                    AS last;
