import Link from "next/link";
import { notFound } from "next/navigation";

import { ApiDown, IncidentList, SectionHead, StatRow } from "@/components/Blocks";
import { CopyButton } from "@/components/Buttons";
import { ExpiryRow, SecurityList, securityScore } from "@/components/Checks";
import { PulseLegend, PulseStrip } from "@/components/PulseStrip";
import { ResponseChart } from "@/components/ResponseChart";
import { SiteIcon } from "@/components/SiteIcon";
import { Status, StatusShape, statusOf } from "@/components/Status";
import { api, API_PUBLIC_URL, ApiError } from "@/lib/api";
import { dateLong, dateTime, host, ms, percent, timeAgo } from "@/lib/format";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";

const WINDOWS = [
  { h: 24, label: "24 ore" },
  { h: 72, label: "3 giorni" },
  { h: 168, label: "7 giorni" },
  { h: 720, label: "30 giorni" },
] as const;

export default async function SitePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ h?: string }>;
}) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id < 1) notFound();
  const wanted = Number((await searchParams).h);
  const hours = WINDOWS.find((w) => w.h === wanted)?.h ?? 72;

  let data;
  try {
    const [site, series, transitions, incidents, daily, overview] = await Promise.all([
      api.site(id),
      api.series(id, hours),
      api.transitions(id),
      api.incidents({ siteId: id }),
      api.daily(90, { siteId: id }),
      api.sites(),
    ]);
    data = { site, series, transitions, incidents, daily, now: overview.find((s) => s.id === id) };
  } catch (e) {
    if (e instanceof ApiError && e.message === "not-found") notFound();
    return <ApiDown message={e instanceof ApiError ? e.message : "Errore sconosciuto"} />;
  }
  const { site, series, transitions, incidents, daily, now } = data;
  const kind = now ? statusOf(now) : "nodata";
  const checks90 = daily.reduce((a, d) => a + d.checks, 0);
  const up90 = daily.reduce((a, d) => a + d.up, 0);

  return (
    <div className="space-y-14">
      <section>
        <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-ink-2 hover:text-accent">
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M8.5 3 4.5 7l4 4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Tutti i siti
        </Link>
        <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2">
          <Status kind={kind} />
          <span className="text-sm text-ink-2">
            Ultimo controllo {timeAgo(site.last_checked_at)}
            {now?.status_code ? `, risposta HTTP ${now.status_code}` : ""}
            {now?.response_ms != null ? ` in ${ms(now.response_ms)}` : ""}.
          </span>
        </div>
        <div className="mt-3 flex items-center gap-4">
          <SiteIcon src={site.icon_url} name={site.name} size={52} />
          <h1 className="min-w-0 font-display text-4xl leading-[1.05] font-semibold tracking-tight break-words sm:text-6xl">
            {site.name}
          </h1>
        </div>
        <div className="mt-2 flex flex-wrap items-baseline gap-x-5 gap-y-1 text-ink-2">
          <a
            href={site.url}
            className="underline decoration-line underline-offset-4 hover:text-accent hover:decoration-accent"
            target="_blank"
            rel="noreferrer"
          >
            Apri {host(site.url)}
          </a>
          {site.client_slug && (
            <Link href={`/stato/${site.client_slug}`} className="text-sm hover:text-accent">
              Cliente: {site.client_name}, vedi la pagina di stato
            </Link>
          )}
        </div>
      </section>

      <section>
        <SectionHead title="Gli ultimi 90 giorni">
          <span className="text-sm text-ink-2">
            Uptime <span className="tabular font-medium text-ink">{percent(checks90 ? (100 * up90) / checks90 : null)}</span>
            {" "}su {checks90.toLocaleString("it-IT")} controlli
          </span>
        </SectionHead>
        <PulseStrip days={daily} height={44} />
        <div className="mt-2 flex justify-between text-xs text-muted">
          <span>90 giorni fa</span>
          <span>oggi</span>
        </div>
        <div className="mt-4">
          <PulseLegend />
        </div>
      </section>

      <StatRow
        items={[
          { label: "Uptime 30 giorni", value: percent(site.uptime_30d), hint: `${site.checks_30d} controlli` },
          { label: "Tempo mediano, 7 giorni", value: ms(site.p50_ms_7d), hint: "metà delle risposte è più veloce" },
          { label: "p95, 7 giorni", value: ms(site.p95_ms_7d), hint: "95 risposte su 100 sono più veloci" },
          {
            label: "Protezioni attive",
            value: securityScore(now?.security_headers ?? null),
            hint: "header di sicurezza, dettagli sotto",
          },
        ]}
      />

      <section>
        <SectionHead title="Tempi di risposta">
          <nav aria-label="Periodo del grafico" className="flex rounded-full border border-line p-0.5 text-sm">
            {WINDOWS.map((w) => (
              <Link
                key={w.h}
                href={`/sites/${id}?h=${w.h}`}
                scroll={false}
                aria-current={w.h === hours ? "page" : undefined}
                className={
                  w.h === hours
                    ? "rounded-full bg-accent px-3 py-1 font-medium text-surface"
                    : "rounded-full px-3 py-1 text-ink-2 hover:text-ink"
                }
              >
                {w.label}
              </Link>
            ))}
          </nav>
        </SectionHead>
        <div className="rounded-xl border border-line bg-surface p-4 sm:p-5">
          <ResponseChart points={series} incidents={incidents} />
        </div>
      </section>

      <div className="grid gap-12 md:grid-cols-2">
        <section>
          <SectionHead title="Scadenze e controlli" />
          <ul className="divide-y divide-line">
            <ExpiryRow
              title="Certificato SSL"
              explain="È il lucchetto nel browser. Se scade, chi apre il sito vede un avviso a tutto schermo invece della pagina."
              days={now?.ssl_days_left ?? null}
              warnAt={14}
              detail="Di solito si rinnova da solo: sotto i 14 giorni il rinnovo automatico non sta funzionando."
              empty={site.url.startsWith("https://") ? "In attesa del controllo" : "Il sito non usa HTTPS"}
            />
            <ExpiryRow
              title={site.domain ? `Dominio ${site.domain}` : "Dominio"}
              explain="Il nome del sito si affitta di anno in anno: se non si rinnova, il sito sparisce e il nome può prenderlo qualcun altro."
              days={now?.domain_days_left ?? null}
              warnAt={30}
              detail={
                site.domain_expires_at
                  ? `Scadenza ${dateLong(site.domain_expires_at)}${site.domain_registrar ? `, registrar ${site.domain_registrar}` : ""}. Controllato ${timeAgo(site.domain_checked_at)}.`
                  : undefined
              }
              empty={
                platformHost(site.url)
                  ? "Gestito dalla piattaforma"
                  : site.domain_checked_at
                    ? "Scadenza non pubblicata dal registro"
                    : "Si legge una volta al giorno"
              }
            />
            <ExpiryRow
              title="Testo atteso nella pagina"
              explain={
                site.keyword
                  ? `Il sito conta come online solo se nella pagina c'è “${site.keyword}”: così una pagina di errore che risponde comunque non passa per buona.`
                  : "Nessun testo impostato: basta che il sito risponda. Si aggiunge con cerca= nel file dei siti."
              }
              days={null}
              warnAt={0}
              empty="Non impostato"
              override={keywordState(site.keyword, now?.is_up ?? null, transitions[0]?.error ?? null)}
            />
          </ul>
        </section>

        <section>
          <SectionHead title="Protezioni del sito">
            <span className="text-sm text-ink-2">{securityScore(now?.security_headers ?? null)} attive</span>
          </SectionHead>
          <SecurityList present={now?.security_headers ?? null} />
        </section>
      </div>

      <section className="max-w-3xl">
        <SectionHead title="Badge per il README" />
        <p className="text-ink-2">
          Mostra l&apos;uptime degli ultimi 30 giorni dove vuoi, per esempio nel README di GitHub del progetto. Si
          aggiorna da solo.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- SVG dell'API, non serve l'ottimizzazione delle immagini */}
          <img src={`${API_PUBLIC_URL}/badge/${site.id}.svg`} alt={`Uptime 30 giorni di ${site.name}`} height={20} />
        </div>
        <div className="mt-3 flex items-center gap-3 rounded-lg border border-line bg-surface px-3 py-2">
          <code className="min-w-0 flex-1 truncate text-xs text-ink-2">{badgeMarkdown(site.id, site.name)}</code>
          <CopyButton text={badgeMarkdown(site.id, site.name)} />
        </div>
      </section>

      <div className="grid gap-12 md:grid-cols-2">
        <section>
          <SectionHead title="Disservizi" />
          <IncidentList incidents={incidents} showSite={false} />
        </section>

        <section>
          <SectionHead title="Cambi di stato" />
          {transitions.length === 0 ? (
            <p className="flex items-center gap-2 py-4 text-ink-2">
              <StatusShape kind="ok" /> Sempre online da quando è monitorato.
            </p>
          ) : (
            <ol>
              {transitions.map((t) => (
                <li
                  key={t.checked_at}
                  className="grid grid-cols-[1.25rem_1fr_auto] items-baseline gap-x-3 border-b border-line py-3.5 last:border-0"
                >
                  <span className="self-center">
                    <StatusShape kind={t.is_up ? "ok" : "down"} size={11} />
                  </span>
                  <span className={t.is_up ? "text-sm text-ok-ink" : "text-sm font-medium text-down-ink"}>
                    {t.is_up ? "Tornato online" : "Andato giù"}
                    {!t.is_up && (t.error || t.status_code) && (
                      <span className="font-normal text-muted">, {t.error ?? `HTTP ${t.status_code}`}</span>
                    )}
                  </span>
                  <span className="text-sm text-muted">{dateTime(t.checked_at)}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}

function platformHost(url: string): boolean {
  return /\.(vercel\.app|netlify\.app|github\.io|pages\.dev|onrender\.com|herokuapp\.com|web\.app|firebaseapp\.com)$/.test(host(url));
}

function badgeMarkdown(id: number, name: string): string {
  return `[![Uptime ${name}](${API_PUBLIC_URL}/badge/${id}.svg)](${SITE_URL}/sites/${id})`;
}

function keywordState(keyword: string | null, isUp: boolean | null, lastError: string | null) {
  if (!keyword) return undefined;
  if (isUp) return { kind: "ok" as const, text: "Trovato" };
  if (isUp === false && lastError?.includes("non trovato")) return { kind: "down" as const, text: "Non trovato" };
  return { kind: "nodata" as const, text: "Da verificare" };
}
