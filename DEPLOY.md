# Messa online

Tre pezzi, tutti con piani gratuiti:

| Pezzo | Dove | Note |
|---|---|---|
| Database | Supabase (PostgreSQL) | regione UE |
| API (`api/`) | Vercel, runtime Python | progetto Vercel con cartella radice `api` |
| Dashboard (`web/`) | Vercel, Next.js | progetto Vercel con cartella radice `web` |
| Controllo orario | GitHub Actions (`monitor.yml`) | nessun server da tenere acceso |

## 1. Database su Supabase

1. Crea un progetto (regione `eu-west-1` o `eu-central-1`).
2. SQL Editor → esegui `db/migrations/001_schema.sql`. Il file `db/seed.sql` (dati finti) in produzione **non** va eseguito.
3. Le tabelle sono lette solo dall'API con la connessione diretta: attiva comunque **Row Level Security** sulle tre tabelle senza aggiungere policy, così l'API REST pubblica di Supabase non le espone.
   ```sql
   ALTER TABLE sites ENABLE ROW LEVEL SECURITY;
   ALTER TABLE checks ENABLE ROW LEVEL SECURITY;
   ALTER TABLE incidents ENABLE ROW LEVEL SECURITY;
   ```
4. Project Settings → Database → Connection string → **Transaction pooler** (porta 6543). È il `DATABASE_URL` dell'API.

## 2. API su Vercel

1. Nuovo progetto collegato al repository GitHub, **Root Directory: `api`**. Vercel riconosce FastAPI da `[tool.vercel]` in `pyproject.toml`.
2. Variabili d'ambiente (Production):
   - `DATABASE_URL`: stringa del Transaction pooler di Supabase
   - `POLSO_INGEST_TOKEN`: stringa casuale lunga (`openssl rand -hex 32`)
   - facoltative: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`
3. Deploy, poi verifica: `https://<api>.vercel.app/health` deve rispondere `{"ok":true,"database":true}`.

## 3. Dashboard su Vercel

1. Secondo progetto dallo stesso repository, **Root Directory: `web`**.
2. Variabile: `POLSO_API_URL` = indirizzo dell'API del punto 2.

## 4. Controllo orario su GitHub Actions

Repository → Settings → Secrets and variables → Actions → New repository secret:

| Secret | Valore |
|---|---|
| `POLSO_API_URL` | indirizzo dell'API |
| `POLSO_INGEST_TOKEN` | lo stesso token dell'API |
| `POLSO_SITES` | i siti, uno per riga, come in `checker/sites.example.txt` (facoltativo) |

Poi Actions → **Monitor** → *Run workflow* per il primo controllo. Da lì gira da solo al minuto 7 di ogni ora.

> GitHub sospende i workflow programmati di un repository senza attività per 60 giorni: un commit ogni tanto, o un clic su *Enable workflow*, li riattiva.

## Elenco dei segreti

| Nome | Dove serve |
|---|---|
| `DATABASE_URL` | API (Vercel) |
| `POLSO_INGEST_TOKEN` | API (Vercel) e GitHub Actions |
| `POLSO_API_URL` | Dashboard (Vercel) e GitHub Actions |
| `POLSO_SITES` | GitHub Actions |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | API (facoltativi) |

Nessuno di questi valori va scritto nel codice o committato.
