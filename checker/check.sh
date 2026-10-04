#!/usr/bin/env bash
#
# Polso checker: controlla una lista di siti e manda i risultati all'API.
#
# Per ogni sito misura:
#   - se risponde e con quale codice HTTP (curl)
#   - quanto ci mette (curl -w %{time_total})
#   - se nella pagina c'è il testo atteso (facoltativo, "cerca=")
#   - quali header di sicurezza manda (HSTS, CSP, ...)
#   - quando scade il certificato SSL (openssl)
# Con --domains invece legge la scadenza dei domini (RDAP, oppure whois se c'è).
#
# Uso:  ./check.sh [--sites FILE] [--domains] [--heartbeats FILE] [--ping SLUG] [--dry-run] [--every SECONDI]
# Serve: bash 4+, curl, openssl, jq, date di GNU (coreutils); whois facoltativo

set -euo pipefail   # esci al primo errore, variabili non definite = errore, errori nelle pipe = errore

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly SCRIPT_DIR

SITES_FILE="${POLSO_SITES_FILE:-$SCRIPT_DIR/sites.txt}"
API_URL="${POLSO_API_URL:-http://localhost:8000}"
TOKEN="${POLSO_INGEST_TOKEN:-}"
TOKEN="${TOKEN//[$'\t\r\n ']/}"   # toglie spazi e a capo copiati per sbaglio con il token
TIMEOUT="${POLSO_TIMEOUT:-15}"
RDAP_URL="${POLSO_RDAP_URL:-https://rdap.org}"
DRY_RUN=false
EVERY=0
MODE=checks          # checks = controlla i siti, domains = scadenza dei domini
HEARTBEATS_FILE=""
PING_SLUG=""

usage() {
    cat <<'EOF'
Polso checker: controlla i siti e invia i risultati all'API.

Uso:
  check.sh [opzioni]

Opzioni:
  --sites FILE       file con i siti (predefinito: sites.txt accanto allo script)
  --domains          invece dei controlli, legge la scadenza dei domini (una volta al giorno basta)
  --heartbeats FILE  invia anche l'elenco delle attività programmate da sorvegliare
  --ping SLUG        a fine giro riuscito, dà un segno di vita all'attività SLUG
  --test-alert       manda solo un messaggio di prova sui canali di avviso (Slack, Telegram)
  --dry-run          stampa il JSON invece di inviarlo
  --every SECONDI    ripete il controllo all'infinito ogni N secondi
  -h, --help         mostra questo aiuto

Variabili d'ambiente:
  POLSO_API_URL       indirizzo dell'API (predefinito http://localhost:8000)
  POLSO_INGEST_TOKEN  token per scrivere sull'API (obbligatorio senza --dry-run)
  POLSO_TIMEOUT       secondi massimi per sito (predefinito 15)

Esempio di sites.txt (dopo l'URL: nome, poi opzioni separate da |):
  # le righe con # sono commenti
  https://kdigitalsolution.it  K Digital Solution | cliente=K Digital Solution | cerca=Contattaci
  https://naivy.it

Esempio di heartbeats.txt (slug, ogni quanto, tolleranza, nome):
  controllo-domini  24h  2h  Controllo dei domini
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
            --domains) MODE=domains; shift ;;
            --heartbeats) HEARTBEATS_FILE="${2:?manca il file dopo --heartbeats}"; shift 2 ;;
            --ping)    PING_SLUG="${2:?manca lo slug dopo --ping}"; shift 2 ;;
            --test-alert) MODE=test-alert; shift ;;
            --every)   EVERY="${2:?mancano i secondi dopo --every}"; shift 2 ;;
            -h|--help) usage; exit 0 ;;
            *)         die "opzione sconosciuta: $1 (usa --help)" ;;
        esac
    done
    [[ "$EVERY" =~ ^[0-9]+$ ]] || die "--every vuole un numero di secondi"
    [[ -z "$PING_SLUG" || "$PING_SLUG" =~ ^[a-z0-9][a-z0-9-]*$ ]] || die "--ping vuole uno slug: lettere minuscole, numeri e trattini"
}

require_tools() {
    local tool
    for tool in curl openssl jq date; do
        command -v "$tool" >/dev/null 2>&1 || die "manca il comando '$tool'"
    done
}

# toglie gli spazi all'inizio e alla fine
trim() {
    local s="$1"
    s="${s#"${s%%[![:space:]]*}"}"
    s="${s%"${s##*[![:space:]]}"}"
    printf '%s' "$s"
}

# Separatore dei campi tra read_sites e chi la legge: il carattere "unit separator" (0x1F).
# Non un TAB: bash considera il TAB uno spazio e unirebbe due TAB di fila, perdendo i campi vuoti.
readonly FS=$'\x1f'

# Legge sites.txt: salta righe vuote e commenti, stampa "URL␟nome␟cliente␟testo da cercare␟logo".
# Formato di una riga:  URL  nome del sito | cliente=Nome cliente | cerca=testo | logo=https://...
read_sites() {
    [[ -r "$SITES_FILE" ]] || die "file dei siti non trovato: $SITES_FILE (copia sites.example.txt in sites.txt)"
    local url rest name client keyword logo part key value
    local -a parts
    while read -r url rest || [[ -n "$url" ]]; do
        [[ -z "$url" || "$url" == \#* ]] && continue
        [[ "$url" =~ ^https?:// ]] || { log "riga ignorata, non è un URL http(s): $url"; continue; }
        client="" keyword="" logo=""
        IFS='|' read -r -a parts <<<"$rest"
        name="$(trim "${parts[0]:-}")"
        for part in "${parts[@]:1}"; do
            key="$(trim "${part%%=*}")"
            value="$(trim "${part#*=}")"
            case "$key" in
                cliente) client="$value" ;;
                cerca)   keyword="$value" ;;
                logo)    logo="$value" ;;
                *)       log "opzione sconosciuta ignorata per $url: $key" ;;
            esac
        done
        printf '%s\n' "$url$FS$name$FS$client$FS$keyword$FS$logo"
    done < "$SITES_FILE"
}

# Controllo HTTP. Stampa:
#   "codice totale_ms url_finale redirect_ms attesa_ms download_ms byte n_redirect messaggio_errore"
# dove totale = redirect + attesa (connessione, TLS e lavoro del server) + download della pagina.
# Salva anche intestazioni e contenuto della pagina nei file $2 e $3, per gli altri controlli.
# curl scrive 000 come codice quando non riceve risposta.
check_http() {
    local url="$1" headers="$2" body="$3" out err code total final redir start size nredir
    err="$(mktemp)"
    out="$(curl --silent --show-error --location --max-redirs 5 \
                --max-time "$TIMEOUT" --max-filesize 5000000 \
                --dump-header "$headers" --output "$body" \
                --user-agent "PolsoMonitor/1.0" \
                --write-out '%{http_code} %{time_total} %{url_effective} %{time_redirect} %{time_starttransfer} %{size_download} %{num_redirects}' \
                "$url" 2>"$err")" || true
    read -r code total final redir start size nredir <<<"$out"
    # i tempi di curl sono cumulativi dall'inizio: si ricavano le parti per differenza.
    # awk fa i conti con i decimali (bash no) e converte i secondi in millisecondi
    local t_ms r_ms w_ms d_ms
    read -r t_ms r_ms w_ms d_ms <<<"$(awk -v t="${total:-0}" -v r="${redir:-0}" -v s="${start:-0}" \
        'BEGIN { w = s - r; if (w < 0) w = 0; d = t - s; if (d < 0) d = 0;
                 printf "%d %d %d %d", t * 1000, r * 1000, w * 1000, d * 1000 }')"
    printf '%s %s %s %s %s %s %s %s %s\n' "${code:-000}" "$t_ms" "${final:-$url}" "$r_ms" "$w_ms" "$d_ms" \
        "${size:-0}" "${nredir:-0}" "$(head -c 300 "$err" | tr '\n' ' ')"
    rm -f "$err"
}

# Indirizzo dell'icona del sito, come scritto nella pagina (può essere relativo: lo risolve l'API).
# Preferisce l'apple-touch-icon (PNG grande e nitido), altrimenti la prima icona dichiarata.
# Vuoto se la pagina non ne dichiara: l'API proverà /favicon.ico.
icon_href() {
    local file="$1" links line href
    [[ -s "$file" ]] || return 0
    links="$(grep -oiE '<link[^>]+>' "$file" 2>/dev/null | head -n 80)" || return 0
    line="$(grep -iE "rel=[\"']?apple-touch-icon" <<<"$links" | head -n 1)" || true
    [[ -n "$line" ]] || line="$(grep -iE "rel=[\"']?([a-z ]* )?icon[\"' >]" <<<"$links" | head -n 1)" || true
    [[ -n "$line" ]] || return 0
    # href="..." (può contenere apici singoli e spazi), href='...' oppure href=senza-virgolette
    href="$(sed -nE -e 's/.*[[:space:]]href="([^"]*)".*/\1/Ip;t' \
                    -e "s/.*[[:space:]]href='([^']*)'.*/\\1/Ip;t" \
                    -e 's/.*[[:space:]]href=([^ >]+).*/\1/Ip' <<<"$line" | head -n 1)"
    # \& perché da bash 5.2 una & nella sostituzione vuol dire "il testo trovato"
    href="${href//&amp;/\&}"
    # molte pagine incorporano l'icona (data:image/...): va bene, ma non oltre 100 KB
    if [[ "$href" == data:* ]]; then
        [[ "$href" == data:image/* && ${#href} -le 100000 ]] || return 0
        href="${href// /%20}"   # spazi codificati: l'indirizzo resta valido ovunque
    elif (( ${#href} > 1000 )); then
        return 0
    fi
    printf '%s' "$href"
}

# Header di sicurezza della risposta FINALE (dopo i redirect), come array JSON di nomi corti.
# Con --location curl scrive le intestazioni di ogni risposta: teniamo solo l'ultimo blocco.
security_headers() {
    local file="$1" last found=()
    [[ -s "$file" ]] || { echo '[]'; return 0; }
    last="$(awk '/^HTTP\//{block=""} {block=block $0 "\n"} END{printf "%s", block}' "$file" \
            | tr -d '\r' | tr '[:upper:]' '[:lower:]')"
    grep -q '^strict-transport-security:' <<<"$last"            && found+=(hsts)
    grep -q '^content-security-policy:' <<<"$last"              && found+=(csp)
    grep -q '^x-content-type-options: *nosniff' <<<"$last"      && found+=(nosniff)
    # contro l'inserimento del sito in un iframe altrui: X-Frame-Options o frame-ancestors nella CSP
    grep -qE '^x-frame-options:|^content-security-policy:.*frame-ancestors' <<<"$last" && found+=(frame)
    grep -q '^referrer-policy:' <<<"$last"                      && found+=(referrer)
    grep -q '^permissions-policy:' <<<"$last"                   && found+=(permissions)
    if (( ${#found[@]} == 0 )); then echo '[]'; else printf '%s\n' "${found[@]}" | jq -R . | jq -sc .; fi
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
    local url="$1" name="$2" client="$3" keyword="$4" logo="${5:-}" code ms final redir_ms wait_ms down_ms size nredir error
    local expires headers body sec='[]' icon="" is_up=false
    headers="$(mktemp)"; body="$(mktemp)"
    read -r code ms final redir_ms wait_ms down_ms size nredir error <<<"$(check_http "$url" "$headers" "$body")"
    expires="$(ssl_expiry "$url")"
    # su = ha risposto con un codice tra 200 e 399
    if [[ "$code" =~ ^[0-9]+$ ]] && (( code >= 200 && code < 400 )); then
        is_up=true
        sec="$(security_headers "$headers")"
        # logo= nel file dei siti vince sull'icona della pagina (per i siti che non ne hanno una)
        icon="${logo:-$(icon_href "$body")}"
        # risponde, ma la pagina è quella giusta? (un 200 può essere anche una pagina di errore)
        if [[ -n "$keyword" ]] && ! grep -qiF -- "$keyword" "$body"; then
            is_up=false
            error="testo \"$keyword\" non trovato nella pagina"
        fi
    fi
    rm -f "$headers" "$body"
    if [[ "$is_up" == true ]]; then
        error=""
    elif [[ -z "$error" ]]; then
        error="HTTP $code"   # ha risposto, ma con un errore (es. 500)
    fi

    # jq costruisce JSON valido: niente problemi con virgolette o caratteri strani
    jq -n --arg url "$url" --arg name "$name" --arg at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
          --argjson up "$is_up" --arg code "$code" --arg ms "$ms" \
          --arg exp "$expires" --arg err "$error" \
          --arg client "$client" --arg kw "$keyword" --argjson sec "$sec" \
          --arg final "$final" --arg icon "$icon" \
          --arg rms "$redir_ms" --arg wms "$wait_ms" --arg dms "$down_ms" --arg size "$size" --arg nred "$nredir" '{
        url: $url,
        name: (if $name == "" then null else $name end),
        checked_at: $at,
        is_up: $up,
        status_code: (if $code == "000" then null else ($code | tonumber) end),
        response_ms: (if $up then ($ms | tonumber) else null end),
        ssl_expires_at: (if $exp == "" then null else $exp end),
        error: (if $err == "" then null else $err end),
        client: (if $client == "" then null else $client end),
        keyword: (if $kw == "" then null else $kw end),
        security_headers: (if $code == "000" then null else $sec end),
        final_url: (if $code == "000" or $final == "" then null else $final end),
        icon_href: (if $icon == "" then null else $icon end),
        timing: (if $up then {
            redirect_ms: ($rms | tonumber), wait_ms: ($wms | tonumber), download_ms: ($dms | tonumber),
            size_bytes: ($size | tonumber), redirects: ($nred | tonumber)
        } else null end)
    }'
}

# --- Domini --------------------------------------------------------------------------------

# Dominio "registrabile" di un indirizzo: www.naivy.it -> naivy.it.
# Niente per i sottodomini delle piattaforme (x.vercel.app): lì il dominio non è nostro e non scade.
registrable_domain() {
    local host="$1"
    host="${host#*://}"; host="${host%%/*}"; host="${host%%:*}"; host="${host,,}"
    case "$host" in
        *.vercel.app|*.netlify.app|*.github.io|*.pages.dev|*.onrender.com|*.herokuapp.com|*.web.app|*.firebaseapp.com|localhost|127.*)
            return 0 ;;
    esac
    [[ "$host" == *.* ]] || return 0
    # ultime due parti; per i casi tipo .co.uk ne servono tre
    local two="${host#"${host%.*.*}".}"
    case "$two" in
        co.uk|org.uk|com.au|co.jp|com.br) printf '%s\n' "${host#"${host%.*.*.*}".}" ;;
        *) printf '%s\n' "$two" ;;
    esac
}

# Scadenza e registrar via RDAP (il successore moderno di whois, risponde in JSON).
# Stampa "data_iso<TAB>registrar", vuoto se non trova niente.
domain_rdap() {
    local domain="$1" json
    json="$(curl --silent --location --max-time 15 -H 'Accept: application/rdap+json' "$RDAP_URL/domain/$domain" 2>/dev/null)" || return 0
    jq -r '[
        (first((.events // [])[] | select(.eventAction == "expiration") | .eventDate) // ""),
        ([(.entities // [])[] | select((.roles // []) | index("registrar"))
            | (.vcardArray[1] // [])[] | select(.[0] == "fn") | .[3]] | first) // ""
    ] | @tsv' <<<"$json" 2>/dev/null | head -n 1 || true
}

# Ripiego con whois, per i registri che non hanno RDAP. Le risposte non hanno un formato unico:
# cerchiamo la prima riga con una data di scadenza tra le forme più comuni.
domain_whois() {
    local domain="$1" line value
    command -v whois >/dev/null 2>&1 || return 0
    line="$(timeout 15 whois "$domain" 2>/dev/null \
            | grep -iE '^[[:space:]]*(registry expiry date|registrar registration expiration date|expir(y|ation|e) date|expires on|paid-till):' \
            | head -n 1)" || return 0
    value="$(trim "${line#*:}")"
    [[ -n "$value" ]] || return 0
    printf '%s\t\n' "$value"
}

check_domains() {
    local url name client keyword domain info expires registrar results=() iso dated=0
    local -A seen=()
    while IFS="$FS" read -r url name client keyword _; do
        domain="$(registrable_domain "$url")"
        if [[ -z "$domain" ]]; then
            log "dominio di $url: gestito dalla piattaforma, salto"
            continue
        fi
        # due siti sullo stesso dominio (es. sito e area clienti): una sola richiesta
        if [[ -z "${seen[$domain]+x}" ]]; then
            info="$(domain_rdap "$domain")"
            [[ -z "${info%%$'\t'*}" ]] && info="$(domain_whois "$domain")"
            seen[$domain]="$info"
        fi
        info="${seen[$domain]}"
        expires="${info%%$'\t'*}"
        registrar="${info#*$'\t'}"
        [[ "$info" == *$'\t'* ]] || registrar=""
        iso=""
        if [[ -n "$expires" ]]; then
            iso="$(date -u -d "$expires" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || true)"
        fi
        [[ -n "$iso" ]] && dated=$(( dated + 1 ))
        log "dominio $domain ($url): ${iso:-scadenza non trovata}"
        results+=("$(jq -nc --arg url "$url" --arg d "$domain" --arg e "$iso" --arg r "$registrar" '{
            url: $url, domain: $d,
            expires_at: (if $e == "" then null else $e end),
            registrar: (if $r == "" then null else $r end)
        }')")
    done < <(read_sites)

    (( ${#results[@]} > 0 )) || { log "nessun dominio da controllare"; return 0; }
    local payload
    payload="$(printf '%s\n' "${results[@]}" | jq -s '.')"
    if [[ "$DRY_RUN" == true ]]; then
        printf '%s\n' "$payload"
    else
        post_json "/domains" "$payload"
        log "inviate ${#results[@]} scadenze di dominio"
    fi
    # nessuna scadenza letta = RDAP e whois non funzionano: meglio un errore visibile
    # (e niente segno di vita per "controllo-domini") che un controllo che finge di essere andato bene
    (( dated > 0 )) || die "nessuna scadenza di dominio letta: RDAP e whois non hanno risposto"
}

# --- Attività programmate ------------------------------------------------------------------

# "90m", "24h", "7d" o un numero di minuti -> minuti
to_minutes() {
    local v="$1"
    case "$v" in
        *m) v="${v%m}"; [[ "$v" =~ ^[0-9]+$ ]] && echo "$v" ;;
        *h) v="${v%h}"; [[ "$v" =~ ^[0-9]+$ ]] && echo $(( v * 60 )) ;;
        *d) v="${v%d}"; [[ "$v" =~ ^[0-9]+$ ]] && echo $(( v * 1440 )) ;;
        *)  [[ "$v" =~ ^[0-9]+$ ]] && echo "$v" ;;
    esac
}

read_heartbeats() {
    [[ -r "$HEARTBEATS_FILE" ]] || die "file delle attività non trovato: $HEARTBEATS_FILE"
    local slug period grace name p g
    while read -r slug period grace name || [[ -n "$slug" ]]; do
        [[ -z "$slug" || "$slug" == \#* ]] && continue
        p="$(to_minutes "$period")"; g="$(to_minutes "$grace")"
        if [[ ! "$slug" =~ ^[a-z0-9][a-z0-9-]*$ || -z "$p" || -z "$g" ]]; then
            log "riga ignorata in $HEARTBEATS_FILE: $slug $period $grace"
            continue
        fi
        jq -nc --arg s "$slug" --arg n "${name:-$slug}" --argjson p "$p" --argjson g "$g" \
            '{slug: $s, name: $n, period_min: $p, grace_min: $g}'
    done < "$HEARTBEATS_FILE"
}

send_heartbeats() {
    local payload
    payload="$(read_heartbeats | jq -s '.')"
    if [[ "$DRY_RUN" == true ]]; then
        printf '%s\n' "$payload"
    else
        post_json "/heartbeats?sync=true" "$payload"
        log "inviate $(jq length <<<"$payload") attività programmate"
    fi
}

send_ping() {
    if [[ "$DRY_RUN" == true ]]; then
        log "(prova) segno di vita per $PING_SLUG"
    else
        post_json "/ping/$PING_SLUG" ""
        log "segno di vita inviato: $PING_SLUG"
    fi
}

# POST all'API con il token. Esce con errore se l'API non risponde 200.
post_json() {
    local path="$1" payload="$2" status
    [[ -n "$TOKEN" ]] || die "POLSO_INGEST_TOKEN non impostato (oppure usa --dry-run)"
    status="$(curl --silent --show-error --max-time 30 --output /dev/stderr --write-out '%{http_code}' \
                   -X POST "$API_URL$path" \
                   -H "Authorization: Bearer $TOKEN" \
                   -H "Content-Type: application/json" \
                   --data-binary "$payload")" || die "API non raggiungibile su $API_URL"
    echo >&2
    [[ "$status" == 200 ]] || die "l'API ha risposto $status su $path"
}

run_checks() {
    local url name client keyword logo results=() line
    while IFS="$FS" read -r url name client keyword logo; do
        log "controllo $url"
        line="$(check_site "$url" "$name" "$client" "$keyword" "$logo")"
        results+=("$line")
        log "  -> $(jq -r 'if .is_up then "su, \(.status_code), \(.response_ms) ms" else "GIÙ: \(.error)" end' <<<"$line")"
    done < <(read_sites)

    (( ${#results[@]} > 0 )) || die "nessun sito da controllare in $SITES_FILE"

    local payload
    payload="$(printf '%s\n' "${results[@]}" | jq -s '.')"   # tante righe JSON -> un array
    if [[ "$DRY_RUN" == true ]]; then
        printf '%s\n' "$payload"
    else
        # sync=true: la lista inviata è quella completa, i siti tolti da sites.txt spariscono dalla dashboard
        post_json "/checks?sync=true" "$payload"
        log "inviati ${#results[@]} controlli a $API_URL"
    fi
}

run_once() {
    if [[ "$MODE" == test-alert ]]; then
        post_json "/alerts/test" ""
        log "messaggio di prova inviato"
        return 0
    fi
    if [[ "$MODE" == domains ]]; then
        check_domains
    else
        run_checks
    fi
    if [[ -n "$HEARTBEATS_FILE" ]]; then send_heartbeats; fi
    # il segno di vita parte solo se tutto quello che c'è sopra è andato a buon fine
    if [[ -n "$PING_SLUG" ]]; then send_ping; fi
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
