# Messa online

| Pezzo | Dove | Note |
|---|---|---|
| Database | Neon (PostgreSQL), dal Marketplace di Vercel | piano gratuito, regione Francoforte |
| API (`api/`) | Vercel, runtime Python | progetto con cartella radice `api` |
| Dashboard (`web/`) | Vercel, Next.js | progetto con cartella radice `web` |
| Controlli ogni 15 minuti | GitHub Actions (`monitor.yml`) | nessun server da tenere acceso |

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

## 4. Controlli su GitHub Actions

Repository → Settings → Secrets and variables → Actions → New repository secret:

| Secret | Valore |
|---|---|
| `POLSO_API_URL` | indirizzo dell'API |
| `POLSO_INGEST_TOKEN` | lo stesso token dell'API |
| `POLSO_SITES` | facoltativo: lista privata dei siti, uno per riga. Senza secret si usa `checker/sites.monitor.txt` |

Il checker invia sempre la lista completa (`?sync=true`): un sito tolto dalla lista sparisce dalla dashboard, con lo storico conservato nel database.

Poi Actions → **Monitor** → *Run workflow* per il primo controllo. Da lì gira da solo:

- **ogni 15 minuti** (minuti 7, 22, 37, 52): controllo dei siti e invio dell'elenco delle attività programmate (`checker/heartbeats.txt`);
- **una volta al giorno** (04:41 UTC): scadenza dei domini, poi segno di vita dell'attività `controllo-domini`. A mano: *Run workflow* → modo `domini`.

### Il file dei siti

Una riga per sito: URL, nome e opzioni separate da `|`.

```
https://naivy.it   Naivy | cliente=K Digital Solution | cerca=Naivy
```

- `cliente=` raggruppa i siti per la pagina di stato (`/stato/k-digital-solution`) e il report mensile;
- `cerca=` fa contare il sito come giù se nella pagina manca quel testo. Meglio un testo del titolo, che cambia di rado.

## 5. Attività programmate

Polso può sorvegliare qualunque lavoro che gira a orari fissi (backup, script, cron). Si dichiarano in `checker/heartbeats.txt`:

```
# slug           ogni  tolleranza  nome
backup-database  24h   2h          Backup notturno del database
```

e alla fine del lavoro si chiama:

```bash
curl -fsS -X POST -H "Authorization: Bearer $POLSO_INGEST_TOKEN" https://polso-api.vercel.app/ping/backup-database
```

Se il segno di vita non arriva entro "ogni + tolleranza", la dashboard segna l'attività in ritardo e parte un avviso.

## 6. Avvisi su Telegram (facoltativo)

1. Su Telegram scrivi a **@BotFather**, comando `/newbot`: alla fine ti dà il token del bot.
2. Scrivi un messaggio qualsiasi al tuo bot, poi apri `https://api.telegram.org/bot<TOKEN>/getUpdates`: il numero in `chat.id` è il tuo chat id.
3. Su Vercel, progetto dell'API → Settings → Environment Variables: aggiungi `TELEGRAM_BOT_TOKEN` e `TELEGRAM_CHAT_ID`, poi *Redeploy*.

Da quel momento arrivano: sito giù, sito tornato online, attività in ritardo, attività ripartita.

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
