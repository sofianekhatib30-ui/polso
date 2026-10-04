# Messa online

| Pezzo | Dove | Note |
|---|---|---|
| Database | Neon (PostgreSQL), dal Marketplace di Vercel | piano gratuito, regione Francoforte |
| API (`api/`) | Vercel, runtime Python | progetto con cartella radice `api` |
| Dashboard (`web/`) | Vercel, Next.js | progetto con cartella radice `web` |
| Controllo orario | GitHub Actions (`monitor.yml`) | nessun server da tenere acceso |

Polso funziona con qualunque PostgreSQL 15+: Neon, Supabase o un server proprio. Basta la stringa di connessione in `DATABASE_URL`.

## 1. Database

Vercel → Storage → Create Database → **Neon** → nome `polso`, regione `Frankfurt`.

Le tabelle non vanno create a mano: l'API esegue `api/app/sql/schema.sql` a ogni avvio, e quel file usa solo `CREATE ... IF NOT EXISTS`. Il file `db/seed.sql` (dati finti) in produzione **non** va eseguito.

## 2. API su Vercel

1. vercel.com/new → importa il repository `polso` → **Root Directory: `api`** → nome progetto `polso-api`. Vercel riconosce FastAPI da `[tool.vercel]` in `pyproject.toml`.
2. Variabili d'ambiente:
   - `POLSO_INGEST_TOKEN`: stringa casuale lunga (`openssl rand -hex 32`)
   - facoltative: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`
3. Deploy. Poi Storage → database `polso` → **Connect Project** → `polso-api`: Vercel aggiunge da solo `DATABASE_URL`. Rifai il deploy perché la legga.
4. Verifica: `https://<api>.vercel.app/health` deve rispondere `{"ok":true,"database":true}`.

## 3. Dashboard su Vercel

1. vercel.com/new → stesso repository → **Root Directory: `web`** → nome progetto `polso`.
2. Variabile: `POLSO_API_URL` = indirizzo dell'API del punto 2, senza `/` finale.

## 4. Controllo orario su GitHub Actions

Repository → Settings → Secrets and variables → Actions → New repository secret:

| Secret | Valore |
|---|---|
| `POLSO_API_URL` | indirizzo dell'API |
| `POLSO_INGEST_TOKEN` | lo stesso token dell'API |
| `POLSO_SITES` | facoltativo: lista privata dei siti, uno per riga. Senza secret si usa `checker/sites.monitor.txt` |

Il checker invia sempre la lista completa (`?sync=true`): un sito tolto dalla lista sparisce dalla dashboard, con lo storico conservato nel database.

Poi Actions → **Monitor** → *Run workflow* per il primo controllo. Da lì gira da solo al minuto 7 di ogni ora.

> GitHub sospende i workflow programmati di un repository senza attività per 60 giorni: un commit ogni tanto, o un clic su *Enable workflow*, li riattiva.

## Elenco dei segreti

| Nome | Dove serve |
|---|---|
| `DATABASE_URL` | API (Vercel, aggiunto da Neon) |
| `POLSO_INGEST_TOKEN` | API (Vercel) e GitHub Actions |
| `POLSO_API_URL` | Dashboard (Vercel) e GitHub Actions |
| `POLSO_SITES` | GitHub Actions |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | API (facoltativi) |

Nessuno di questi valori va scritto nel codice o committato. Dashboard, API in lettura e log di GitHub Actions sono pubblici: si monitorano solo siti propri o di clienti che sono d'accordo.
