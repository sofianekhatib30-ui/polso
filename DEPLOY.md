# Messa online

| Pezzo | Dove | Note |
|---|---|---|
| Database | Neon (PostgreSQL), dal Marketplace di Vercel | piano gratuito, regione Francoforte |
| API (`api/`) | Vercel, runtime Python | progetto con cartella radice `api` |
| Dashboard (`web/`) | Vercel, Next.js | progetto con cartella radice `web` |
| Controlli ogni 15 minuti | GitHub Actions (`monitor.yml`), fatto partire da cron-job.org | nessun server da tenere acceso |

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

Poi Actions → **Monitor** → *Run workflow* per il primo controllo.

### Chi lo fa partire: cron-job.org

L'orario di GitHub (`schedule`) sui repository gratuiti è "quando può": il primo giorno è partito 2 volte su più di 20. Per questo il workflow lo fa partire [cron-job.org](https://cron-job.org) (gratis), con una chiamata all'API di GitHub:

- **ogni 15 minuti**: controllo dei siti e invio dell'elenco delle attività programmate (`checker/heartbeats.txt`);
- **una volta al giorno** (06:41): scadenza dei domini, poi segno di vita dell'attività `controllo-domini`. Resta anche l'orario di GitHub alle 04:41 UTC, come riserva.

Ogni job di cron-job.org:

- URL: `https://api.github.com/repos/<utente>/polso/actions/workflows/monitor.yml/dispatches`, metodo `POST`
- header: `Accept: application/vnd.github+json`, `Authorization: Bearer <token>`, `X-GitHub-Api-Version: 2022-11-28`, `Content-Type: application/json`
- body: `{"ref":"main","inputs":{"modo":"controlli"}}` (oppure `"domini"`)
- risposta attesa: `204`

Il token è un *fine-grained token* di GitHub limitato al solo repository polso, con il solo permesso **Actions: Read and write**. Ha una scadenza: va rinnovato e aggiornato nei due job.

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

## 6. Avvisi su Slack

Gli avvisi arrivano in un canale Slack: sito giù, sito tornato online, attività in ritardo, attività ripartita, certificato SSL in scadenza (a 14, 7, 3 e 1 giorno) e dominio in scadenza (a 30, 14, 7, 3 e 1 giorno). Ogni soglia viene avvisata una volta sola; dopo il rinnovo si riparte da capo.

1. Su Slack crea il canale dove vuoi gli avvisi (per esempio `#polso`).
2. Apri <https://api.slack.com/apps> → **Create New App** → **From scratch**. Nome `Polso`, scegli il tuo workspace.
3. Nel menu a sinistra **Incoming Webhooks** → attiva l'interruttore → **Add New Webhook to Workspace** → scegli il canale → **Allow**.
4. Copia l'indirizzo che compare (`https://hooks.slack.com/services/...`). È una chiave: chi lo ha può scrivere nel canale, quindi non va nel codice.
5. Su Vercel, progetto **polso-api** → Settings → Environment Variables → `SLACK_WEBHOOK_URL` = quell'indirizzo → Save, poi Deployments → ultimo deploy → **Redeploy**.
6. Prova: GitHub → Actions → **Monitor** → Run workflow → modo `prova-avvisi`. Nel canale arriva "Polso è collegato".

In alternativa, o in più, Telegram: crea un bot con **@BotFather** (`/newbot`), scrivigli un messaggio, prendi il `chat.id` da `https://api.telegram.org/bot<TOKEN>/getUpdates` e imposta `TELEGRAM_BOT_TOKEN` e `TELEGRAM_CHAT_ID` sull'API.

## Elenco dei segreti

| Nome | Dove serve |
|---|---|
| `DATABASE_URL` | API (Vercel, aggiunto da Neon) |
| `POLSO_INGEST_TOKEN` | API (Vercel) e GitHub Actions |
| `POLSO_API_URL` | Dashboard (Vercel) e GitHub Actions |
| `POLSO_SITES` | GitHub Actions |
| `SLACK_WEBHOOK_URL` | API (facoltativo, avvisi su Slack) |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | API (facoltativi) |

Nessuno di questi valori va scritto nel codice o committato. Dashboard, API in lettura e log di GitHub Actions sono pubblici: si monitorano solo siti propri o di clienti che sono d'accordo.
