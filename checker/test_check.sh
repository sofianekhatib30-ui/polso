#!/usr/bin/env bash
#
# Test del checker: avvia un piccolo server web locale e verifica il JSON prodotto.
# Uso: ./test_check.sh   (serve python3 per il server di prova)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly SCRIPT_DIR
export NO_PROXY="127.0.0.1,localhost" no_proxy="127.0.0.1,localhost"

PORT=18765
WORK="$(mktemp -d)"
FAILED=0

# shellcheck disable=SC2317,SC2329  # chiamata dal trap qui sotto
cleanup() {
    if [[ -n "${SERVER_PID:-}" ]]; then
        kill "$SERVER_PID" 2>/dev/null || true
    fi
    rm -rf "$WORK"
}
trap cleanup EXIT   # pulisce sempre, anche se un test fallisce

assert_eq() {
    local descrizione="$1" atteso="$2" ottenuto="$3"
    if [[ "$atteso" == "$ottenuto" ]]; then
        printf '  ok    %s\n' "$descrizione"
    else
        printf '  ERRORE %s: atteso "%s", ottenuto "%s"\n' "$descrizione" "$atteso" "$ottenuto"
        FAILED=1
    fi
}

# Server di prova: risponde 200 su /, 404 su tutto il resto.
echo "ciao" > "$WORK/index.html"
python3 -m http.server "$PORT" --bind 127.0.0.1 --directory "$WORK" >/dev/null 2>&1 &
SERVER_PID=$!
for _ in $(seq 1 50); do
    curl -s -o /dev/null "http://127.0.0.1:$PORT/" && break
    sleep 0.1
done

cat > "$WORK/sites.txt" <<EOF
# commento da ignorare

http://127.0.0.1:$PORT/  Sito che funziona
http://127.0.0.1:$PORT/pagina-che-non-esiste
http://127.0.0.1:1/  Porta chiusa
non-e-un-url
EOF

echo "Checker: controlli su server locale"
OUT="$(POLSO_TIMEOUT=5 "$SCRIPT_DIR/check.sh" --sites "$WORK/sites.txt" --dry-run 2>/dev/null)"

assert_eq "JSON valido con 3 siti (commenti e righe errate ignorati)" "3" "$(jq 'length' <<<"$OUT")"
assert_eq "sito che funziona è su"            "true"              "$(jq '.[0].is_up' <<<"$OUT")"
assert_eq "codice 200"                        "200"               "$(jq '.[0].status_code' <<<"$OUT")"
assert_eq "tempo di risposta è un numero"     "number"            "$(jq -r '.[0].response_ms | type' <<<"$OUT")"
assert_eq "nome letto dal file"               "Sito che funziona" "$(jq -r '.[0].name' <<<"$OUT")"
assert_eq "404 conta come giù"                "false"             "$(jq '.[1].is_up' <<<"$OUT")"
assert_eq "errore HTTP 404 registrato"        "HTTP 404"          "$(jq -r '.[1].error' <<<"$OUT")"
assert_eq "porta chiusa è giù"                "false"             "$(jq '.[2].is_up' <<<"$OUT")"
assert_eq "porta chiusa senza codice HTTP"    "null"              "$(jq '.[2].status_code' <<<"$OUT")"
assert_eq "data in UTC con la Z"              "true"              "$(jq '.[0].checked_at | endswith("Z")' <<<"$OUT")"

echo "Checker: errori di uso"
if "$SCRIPT_DIR/check.sh" --opzione-inventata >/dev/null 2>&1; then FAILED=1; echo "  ERRORE opzione sconosciuta accettata"; else echo "  ok    opzione sconosciuta rifiutata"; fi
if "$SCRIPT_DIR/check.sh" --sites "$WORK/sites.txt" >/dev/null 2>&1; then FAILED=1; echo "  ERRORE invio senza token accettato"; else echo "  ok    invio senza token rifiutato"; fi

exit "$FAILED"
