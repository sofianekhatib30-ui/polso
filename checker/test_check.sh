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

# Server di prova: 200 su /, 404 su tutto il resto; /sicuro/ manda anche header di sicurezza.
printf '<html><head><link rel="stylesheet" href="/s.css"><link sizes="32x32" rel="icon" href="/icona.png?v=1&amp;x=2"></head><body>ciao, benvenuti nel sito</body></html>' > "$WORK/index.html"
mkdir -p "$WORK/sicuro" && echo "pagina sicura" > "$WORK/sicuro/index.html"
mkdir -p "$WORK/incorporata" && printf '%s' "<html><head><link rel=\"icon\" href=\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E%3C/svg%3E\"></head><body>ok</body></html>" > "$WORK/incorporata/index.html"
cat > "$WORK/server.py" <<'PY'
import functools, http.server, sys
class H(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        if self.path.startswith("/sicuro"):
            self.send_header("Strict-Transport-Security", "max-age=63072000")
            self.send_header("Content-Security-Policy", "default-src 'self'; frame-ancestors 'none'")
            self.send_header("X-Content-Type-Options", "nosniff")
        super().end_headers()
    def log_message(self, *a): pass
http.server.ThreadingHTTPServer(("127.0.0.1", int(sys.argv[1])), functools.partial(H, directory=sys.argv[2])).serve_forever()
PY
python3 "$WORK/server.py" "$PORT" "$WORK" >/dev/null 2>&1 &
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
http://127.0.0.1:$PORT/  Con testo giusto | cliente=Fondazione L'Ancora | cerca=BENVENUTI
http://127.0.0.1:$PORT/  Con testo sbagliato | cerca=prezzi
http://127.0.0.1:$PORT/sicuro/  Sicuro | opzione=strana | logo=https://esempio.it/logo.svg
http://127.0.0.1:$PORT/incorporata/  Icona incorporata
http://127.0.0.1:$PORT/sicuro  Con redirect
EOF

echo "Checker: controlli su server locale"
OUT="$(POLSO_TIMEOUT=5 "$SCRIPT_DIR/check.sh" --sites "$WORK/sites.txt" --dry-run 2>/dev/null)"

assert_eq "JSON valido con 8 siti (commenti e righe errate ignorati)" "8" "$(jq 'length' <<<"$OUT")"
assert_eq "sito che funziona è su"            "true"              "$(jq '.[0].is_up' <<<"$OUT")"
assert_eq "codice 200"                        "200"               "$(jq '.[0].status_code' <<<"$OUT")"
assert_eq "tempo di risposta è un numero"     "number"            "$(jq -r '.[0].response_ms | type' <<<"$OUT")"
assert_eq "nome letto dal file"               "Sito che funziona" "$(jq -r '.[0].name' <<<"$OUT")"
assert_eq "404 conta come giù"                "false"             "$(jq '.[1].is_up' <<<"$OUT")"
assert_eq "errore HTTP 404 registrato"        "HTTP 404"          "$(jq -r '.[1].error' <<<"$OUT")"
assert_eq "porta chiusa è giù"                "false"             "$(jq '.[2].is_up' <<<"$OUT")"
assert_eq "porta chiusa senza codice HTTP"    "null"              "$(jq '.[2].status_code' <<<"$OUT")"
assert_eq "data in UTC con la Z"              "true"              "$(jq '.[0].checked_at | endswith("Z")' <<<"$OUT")"
assert_eq "senza opzioni: niente cliente"     "null"              "$(jq '.[0].client' <<<"$OUT")"
assert_eq "cliente letto dopo il |"           "Fondazione L'Ancora" "$(jq -r '.[3].client' <<<"$OUT")"
assert_eq "testo trovato (maiuscole ignorate)" "true"             "$(jq '.[3].is_up' <<<"$OUT")"
assert_eq "testo mancante = giù"              "false"             "$(jq '.[4].is_up' <<<"$OUT")"
assert_eq "errore del testo mancante"         'testo "prezzi" non trovato nella pagina' "$(jq -r '.[4].error' <<<"$OUT")"
assert_eq "nessun header di sicurezza"        "[]"                "$(jq -c '.[0].security_headers' <<<"$OUT")"
assert_eq "header di sicurezza riconosciuti"  '["hsts","csp","nosniff","frame"]' "$(jq -c '.[5].security_headers' <<<"$OUT")"
assert_eq "porta chiusa: header sconosciuti"  "null"              "$(jq '.[2].security_headers' <<<"$OUT")"
assert_eq "icona letta dalla pagina"          "/icona.png?v=1&x=2" "$(jq -r '.[0].icon_href' <<<"$OUT")"
assert_eq "logo= vince sull'icona della pagina" "https://esempio.it/logo.svg" "$(jq -r '.[5].icon_href' <<<"$OUT")"
assert_eq "icona incorporata con apici e spazi" "data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%3E%3C/svg%3E" "$(jq -r '.[6].icon_href' <<<"$OUT")"
assert_eq "indirizzo finale dopo i redirect"  "http://127.0.0.1:$PORT/" "$(jq -r '.[0].final_url' <<<"$OUT")"
assert_eq "tempi scomposti presenti"          "true"              "$(jq '.[0].timing | (.redirect_ms|type)=="number" and (.wait_ms|type)=="number" and (.download_ms|type)=="number"' <<<"$OUT")"
assert_eq "peso della pagina in byte"         "$(wc -c < "$WORK/index.html" | tr -d ' ')" "$(jq '.[0].timing.size_bytes' <<<"$OUT")"
assert_eq "nessun redirect"                   "0"                 "$(jq '.[0].timing.redirects' <<<"$OUT")"
assert_eq "sito giù: niente tempi"            "null"              "$(jq '.[2].timing' <<<"$OUT")"
assert_eq "un redirect seguito (/sicuro -> /sicuro/)" "1"        "$(jq '.[7].timing.redirects' <<<"$OUT")"

assert_eq "senza misura dall'API: nessuna origine" "null"          "$(jq '.[0].timing.origin' <<<"$OUT")"

echo "Checker: tempi misurati dall'API"
# Risposte dell'API già pronte: il primo sito con lo stesso codice (i tempi si prendono), il secondo
# con un codice diverso da quello visto qui (i tempi restano quelli locali).
cat > "$WORK/probe.json" <<EOF
{"origin": "fra1", "results": [
  {"url": "http://127.0.0.1:$PORT/", "status_code": 200, "total_ms": 123, "redirect_ms": 0, "wait_ms": 100,
   "download_ms": 23, "size_bytes": 4321, "redirects": 0, "final_url": "http://127.0.0.1:$PORT/", "error": null},
  {"url": "http://127.0.0.1:$PORT/sicuro", "status_code": 403, "total_ms": 999, "redirect_ms": 1, "wait_ms": 2,
   "download_ms": 3, "size_bytes": 4, "redirects": 0, "final_url": null, "error": null}
]}
EOF
printf 'http://127.0.0.1:%s/  Uno\nhttp://127.0.0.1:%s/sicuro  Due\n' "$PORT" "$PORT" > "$WORK/probe-siti.txt"
PR="$(POLSO_TIMEOUT=5 POLSO_PROBE_RESULTS="$WORK/probe.json" "$SCRIPT_DIR/check.sh" --sites "$WORK/probe-siti.txt" --dry-run 2>/dev/null)"
assert_eq "stesso codice: tempo dall'API"     "123"               "$(jq '.[0].response_ms' <<<"$PR")"
assert_eq "stesso codice: parti dall'API"     "0 100 23 4321"     "$(jq -r '.[0].timing | "\(.redirect_ms) \(.wait_ms) \(.download_ms) \(.size_bytes)"' <<<"$PR")"
assert_eq "origine dichiarata"                "fra1"              "$(jq -r '.[0].timing.origin' <<<"$PR")"
assert_eq "codice diverso: tempi di qui"      "null"              "$(jq '.[1].timing.origin' <<<"$PR")"
assert_eq "codice diverso: un redirect visto qui" "1"             "$(jq '.[1].timing.redirects' <<<"$PR")"

echo "Checker: domini"
mkdir -p "$WORK/rdap/domain"
cat > "$WORK/rdap/domain/esempio.it" <<'JSON'
{"events":[{"eventAction":"registration","eventDate":"2020-01-10T00:00:00Z"},{"eventAction":"expiration","eventDate":"2027-01-10T00:00:00Z"}],
 "entities":[{"roles":["registrar"],"vcardArray":["vcard",[["version",{},"text","4.0"],["fn",{},"text","Registrar di Prova"]]]}]}
JSON
cat > "$WORK/domini.txt" <<'TXT'
https://www.esempio.it  Sito
https://area.esempio.it  Area clienti
https://progetto.vercel.app  Su Vercel
https://sconosciuto.example  Senza dati
TXT
DOM="$(POLSO_RDAP_URL="file://$WORK/rdap" "$SCRIPT_DIR/check.sh" --sites "$WORK/domini.txt" --domains --dry-run 2>/dev/null)"
assert_eq "sottodomini delle piattaforme saltati" "3"            "$(jq 'length' <<<"$DOM")"
assert_eq "dominio registrabile"              "esempio.it"        "$(jq -r '.[0].domain' <<<"$DOM")"
assert_eq "scadenza letta da RDAP"            "2027-01-10T00:00:00Z" "$(jq -r '.[1].expires_at' <<<"$DOM")"
assert_eq "registrar letto da RDAP"           "Registrar di Prova" "$(jq -r '.[0].registrar' <<<"$DOM")"
assert_eq "dominio senza dati: scadenza vuota" "null"             "$(jq '.[2].expires_at' <<<"$DOM")"
printf 'https://sconosciuto.example  Senza dati\n' > "$WORK/nessun-dominio.txt"
if POLSO_RDAP_URL="file://$WORK/rdap" "$SCRIPT_DIR/check.sh" --sites "$WORK/nessun-dominio.txt" --domains --dry-run >/dev/null 2>&1; then
    FAILED=1; echo "  ERRORE nessuna scadenza letta ma uscita senza errore"
else
    echo "  ok    nessuna scadenza letta = errore (niente segno di vita)"
fi

echo "Checker: attività programmate"
cat > "$WORK/hb.txt" <<'TXT'
# slug  ogni  tolleranza  nome
controllo-domini  24h  2h  Controllo dei domini
backup  90  15m
Slug-Sbagliato  1h  0  Ignorata
TXT
HB="$(POLSO_RDAP_URL="file://$WORK/rdap" "$SCRIPT_DIR/check.sh" --sites "$WORK/domini.txt" --domains --heartbeats "$WORK/hb.txt" --dry-run 2>/dev/null | jq -s '.[1]')"
assert_eq "attività lette (righe errate ignorate)" "2"            "$(jq 'length' <<<"$HB")"
assert_eq "24h = 1440 minuti"                 "1440"              "$(jq '.[0].period_min' <<<"$HB")"
assert_eq "15m di tolleranza"                 "15"                "$(jq '.[1].grace_min' <<<"$HB")"
assert_eq "nome predefinito = slug"           "backup"            "$(jq -r '.[1].name' <<<"$HB")"

echo "Checker: errori di uso"
if "$SCRIPT_DIR/check.sh" --opzione-inventata >/dev/null 2>&1; then FAILED=1; echo "  ERRORE opzione sconosciuta accettata"; else echo "  ok    opzione sconosciuta rifiutata"; fi
if "$SCRIPT_DIR/check.sh" --sites "$WORK/sites.txt" >/dev/null 2>&1; then FAILED=1; echo "  ERRORE invio senza token accettato"; else echo "  ok    invio senza token rifiutato"; fi
if "$SCRIPT_DIR/check.sh" --ping "Non Valido" --dry-run >/dev/null 2>&1; then FAILED=1; echo "  ERRORE slug non valido accettato"; else echo "  ok    slug del ping non valido rifiutato"; fi

exit "$FAILED"
