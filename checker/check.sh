#!/usr/bin/env bash
#
# Polso checker: controlla una lista di siti e manda i risultati all'API.
#
# Per ogni sito misura:
#   - se risponde e con quale codice HTTP (curl)
#   - quanto ci mette (curl -w %{time_total})
#   - quando scade il certificato SSL (openssl)
#
# Uso:  ./check.sh [--sites FILE] [--dry-run] [--every SECONDI] [--help]
# Serve: bash 4+, curl, openssl, jq, date di GNU (coreutils)

set -euo pipefail   # esci al primo errore, variabili non definite = errore, errori nelle pipe = errore

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly SCRIPT_DIR

SITES_FILE="${POLSO_SITES_FILE:-$SCRIPT_DIR/sites.txt}"
API_URL="${POLSO_API_URL:-http://localhost:8000}"
TOKEN="${POLSO_INGEST_TOKEN:-}"
TIMEOUT="${POLSO_TIMEOUT:-15}"
DRY_RUN=false
EVERY=0

usage() {
    cat <<'EOF'
Polso checker: controlla i siti e invia i risultati all'API.

Uso:
  check.sh [opzioni]

Opzioni:
  --sites FILE     file con i siti, uno per riga: "URL [nome]"
                   (predefinito: sites.txt accanto allo script)
  --dry-run        stampa il JSON invece di inviarlo
  --every SECONDI  ripete il controllo all'infinito ogni N secondi
  -h, --help       mostra questo aiuto

Variabili d'ambiente:
  POLSO_API_URL       indirizzo dell'API (predefinito http://localhost:8000)
  POLSO_INGEST_TOKEN  token per scrivere sull'API (obbligatorio senza --dry-run)
  POLSO_TIMEOUT       secondi massimi per sito (predefinito 15)

Esempio di sites.txt:
  # le righe con # sono commenti
  https://kdigitalsolution.it  K Digital Solution
  https://naivy.it
EOF
}

# I messaggi vanno su stderr, così stdout resta pulito per il JSON.
log() { printf '[%s] %s\n' "$(date -u +%H:%M:%S)" "$*" >&2; }
die() { log "ERRORE: $*"; exit 1; }

parse_args() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --sites)   SITES_FILE="${2:?manca il file dopo --sites}"; shift 2 ;;
            --dry-run) DRY_RUN=true; shift ;;
            --every)   EVERY="${2:?mancano i secondi dopo --every}"; shift 2 ;;
            -h|--help) usage; exit 0 ;;
            *)         die "opzione sconosciuta: $1 (usa --help)" ;;
        esac
    done
    [[ "$EVERY" =~ ^[0-9]+$ ]] || die "--every vuole un numero di secondi"
}

require_tools() {
    local tool
    for tool in curl openssl jq date; do
        command -v "$tool" >/dev/null 2>&1 || die "manca il comando '$tool'"
    done
}

# Legge sites.txt: salta righe vuote e commenti, stampa "URL<TAB>nome".
read_sites() {
    [[ -r "$SITES_FILE" ]] || die "file dei siti non trovato: $SITES_FILE (copia sites.example.txt in sites.txt)"
    local url name
    while read -r url name || [[ -n "$url" ]]; do
        [[ -z "$url" || "$url" == \#* ]] && continue
        [[ "$url" =~ ^https?:// ]] || { log "riga ignorata, non è un URL http(s): $url"; continue; }
        printf '%s\t%s\n' "$url" "$name"
    done < "$SITES_FILE"
}

# Controllo HTTP. Stampa: "codice millisecondi messaggio_errore"
# curl scrive 000 come codice quando non riceve risposta.
check_http() {
    local url="$1" out err code seconds
    err="$(mktemp)"
    out="$(curl --silent --show-error --location --max-redirs 5 \
                --max-time "$TIMEOUT" --output /dev/null \
                --user-agent "PolsoMonitor/1.0" \
                --write-out '%{http_code} %{time_total}' \
                "$url" 2>"$err")" || true
    code="${out%% *}"
    seconds="${out##* }"
    # secondi -> millisecondi, con awk perché bash non fa conti con i decimali
    printf '%s %s %s\n' "${code:-000}" "$(awk -v s="${seconds:-0}" 'BEGIN { printf "%d", s * 1000 }')" "$(head -c 300 "$err" | tr '\n' ' ')"
    rm -f "$err"
}

# Data di scadenza del certificato in formato ISO 8601 UTC, vuota se non leggibile.
ssl_expiry() {
    local url="$1" hostport host port end
    [[ "$url" == https://* ]] || return 0
    hostport="${url#https://}"; hostport="${hostport%%/*}"
    host="${hostport%%:*}"
    port=443
    [[ "$hostport" == *:* ]] && port="${hostport##*:}"
    end="$(timeout 10 openssl s_client -servername "$host" -connect "$host:$port" </dev/null 2>/dev/null \
            | openssl x509 -noout -enddate 2>/dev/null)" || return 0
    end="${end#notAfter=}"
    if [[ -n "$end" ]]; then
        date -u -d "$end" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || true
    fi
}

# Un controllo completo di un sito, in JSON.
check_site() {
    local url="$1" name="$2" code ms error expires is_up=false
    read -r code ms error <<<"$(check_http "$url")"
    expires="$(ssl_expiry "$url")"
    # su = ha risposto con un codice tra 200 e 399
    if [[ "$code" =~ ^[0-9]+$ ]] && (( code >= 200 && code < 400 )); then
        is_up=true
    fi
    if [[ "$is_up" == true ]]; then
        error=""
    elif [[ -z "$error" ]]; then
        error="HTTP $code"   # ha risposto, ma con un errore (es. 500)
    fi

    # jq costruisce JSON valido: niente problemi con virgolette o caratteri strani
    jq -n --arg url "$url" --arg name "$name" --arg at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
          --argjson up "$is_up" --arg code "$code" --arg ms "$ms" \
          --arg exp "$expires" --arg err "$error" '{
        url: $url,
        name: (if $name == "" then null else $name end),
        checked_at: $at,
        is_up: $up,
        status_code: (if $code == "000" then null else ($code | tonumber) end),
        response_ms: (if $up then ($ms | tonumber) else null end),
        ssl_expires_at: (if $exp == "" then null else $exp end),
        error: (if $err == "" then null else $err end)
    }'
}

send_results() {
    local payload="$1" status
    [[ -n "$TOKEN" ]] || die "POLSO_INGEST_TOKEN non impostato (oppure usa --dry-run)"
    status="$(curl --silent --show-error --max-time 30 --output /dev/stderr --write-out '%{http_code}' \
                   -X POST "$API_URL/checks" \
                   -H "Authorization: Bearer $TOKEN" \
                   -H "Content-Type: application/json" \
                   --data-binary "$payload")" || die "API non raggiungibile su $API_URL"
    echo >&2
    [[ "$status" == 200 ]] || die "l'API ha risposto $status"
}

run_once() {
    local url name results=() line
    while IFS=$'\t' read -r url name; do
        log "controllo $url"
        line="$(check_site "$url" "$name")"
        results+=("$line")
        log "  -> $(jq -r 'if .is_up then "su, \(.status_code), \(.response_ms) ms" else "GIÙ: \(.error)" end' <<<"$line")"
    done < <(read_sites)

    (( ${#results[@]} > 0 )) || die "nessun sito da controllare in $SITES_FILE"

    local payload
    payload="$(printf '%s\n' "${results[@]}" | jq -s '.')"   # tante righe JSON -> un array
    if [[ "$DRY_RUN" == true ]]; then
        printf '%s\n' "$payload"
    else
        send_results "$payload"
        log "inviati ${#results[@]} controlli a $API_URL"
    fi
}

main() {
    parse_args "$@"
    require_tools
    if (( EVERY > 0 )); then
        while true; do
            # le parentesi creano una sotto-shell: se run_once chiama "die" (exit),
            # termina solo il giro, non il ciclo infinito
            ( run_once ) || log "giro fallito, riprovo al prossimo"
            sleep "$EVERY"
        done
    else
        run_once
    fi
}

main "$@"
