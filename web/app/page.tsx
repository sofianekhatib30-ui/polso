import Link from "next/link";

import { ApiDown, IncidentList, SectionHead, StatRow } from "@/components/Blocks";
import { PulseLegend, PulseStrip } from "@/components/PulseStrip";
import { SslDays, Status, StatusShape, statusInk, statusLabel, statusOf, type StatusKind } from "@/components/Status";
import { api, ApiError, type DayPoint, type Incident, type SiteOverview } from "@/lib/api";
import { host, ms, percent, timeAgo } from "@/lib/format";

// La pagina legge sempre dati freschi dall'API (niente pagina statica al momento della build).
export const dynamic = "force-dynamic";

const DAYS = 30;

export default async function Home() {
  let sites: SiteOverview[];
  let incidents: Incident[];
  let daily: DayPoint[];
  try {
    [sites, incidents, daily] = await Promise.all([api.sites(), api.incidents(), api.daily(DAYS)]);
  } catch (e) {
    return <ApiDown message={e instanceof ApiError ? e.message : "Errore sconosciuto"} />;
  }

  if (sites.length === 0) {
    return (
      <section className="max-w-2xl">
        <h1 className="font-display text-4xl font-semibold tracking-tight sm:text-5xl">Ancora nessun sito.</h1>
        <p className="mt-4 text-lg text-ink-2">
          Avvia il checker con l&apos;elenco dei siti da controllare: compaiono qui al primo controllo, con lo stato
          e i tempi di risposta.
        </p>
      </section>
    );
  }

  const byStatus = sites.map((s) => ({ site: s, kind: statusOf(s) }));
  const strips = new Map<number, DayPoint[]>();
  for (const d of daily) strips.set(d.site_id, [...(strips.get(d.site_id) ?? []), d]);

  const online = byStatus.filter((x) => x.kind === "ok" || x.kind === "warn").length;
  // gli incidenti aperti si contano dai siti, non dalla lista (che mostra solo gli ultimi 20)
  const openIncidents = sites.filter((s) => s.open_incident).length;
  const sslSoon = sites.filter((s) => s.ssl_days_left !== null && s.ssl_days_left <= 14).length;
  // uptime complessivo = controlli riusciti / controlli fatti, non media delle percentuali dei siti
  const checks = daily.reduce((a, d) => a + d.checks, 0);
  const up = daily.reduce((a, d) => a + d.up, 0);
  const lastCheck = sites.reduce<string | null>(
    (max, s) => (s.last_checked_at && (!max || s.last_checked_at > max) ? s.last_checked_at : max),
    null,
  );

  // i siti con problemi in cima, poi in ordine alfabetico
  const rank: Record<StatusKind, number> = { down: 0, partial: 1, warn: 2, nodata: 3, ok: 4 };
  const ordered = [...byStatus].sort((a, b) => rank[a.kind] - rank[b.kind] || a.site.name.localeCompare(b.site.name));

  return (
    <div className="space-y-14">
      <Headline items={byStatus} total={sites.length} lastCheck={lastCheck} />

      <StatRow
        items={[
          { label: "Siti online", value: `${online} su ${sites.length}` },
          { label: "Disservizi in corso", value: openIncidents },
          { label: "Certificati in scadenza", value: sslSoon, hint: "entro 14 giorni" },
          {
            label: `Uptime ${DAYS} giorni`,
            value: percent(checks ? (100 * up) / checks : null),
            hint: `${checks.toLocaleString("it-IT")} controlli in tutto`,
          },
        ]}
      />

      <section>
        <SectionHead title={`Gli ultimi ${DAYS} giorni`}>
          <PulseLegend />
        </SectionHead>

        <div className="rounded-xl border border-line bg-surface">
          <div
            aria-hidden="true"
            className="hidden grid-cols-[minmax(13rem,16rem)_1fr_6rem_6rem_5rem] gap-6 border-b border-line px-5 py-2.5 text-xs text-muted lg:grid"
          >
            <span>Sito</span>
            <span className="flex justify-between">
              <span>{DAYS} giorni fa</span>
              <span>oggi</span>
            </span>
            <span className="text-right">Uptime {DAYS} g</span>
            <span className="text-right">p95 24 h</span>
            <span className="text-right">SSL</span>
          </div>
          <ul>
            {ordered.map(({ site: s, kind }) => (
              <li key={s.id} className="border-b border-line last:border-0">
                <Link
                  href={`/sites/${s.id}`}
                  className="group grid gap-x-6 gap-y-3 px-5 py-4 transition-colors hover:bg-surface-2 lg:grid-cols-[minmax(13rem,16rem)_1fr_6rem_6rem_5rem] lg:items-center"
                >
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="hidden shrink-0 lg:inline-flex">
                          <StatusShape kind={kind} />
                        </span>
                        <span className="truncate font-medium text-ink group-hover:text-accent">{s.name}</span>
                      </div>
                      <div className="truncate text-xs text-muted lg:pl-[18px]">
                        {kind !== "ok" && <span className={`hidden font-medium lg:inline ${statusInk(kind)}`}>{statusLabel(kind)}, </span>}
                        {host(s.url)}
                      </div>
                    </div>
                    <Status kind={kind} className="shrink-0 lg:hidden" />
                  </div>

                  <div className="min-w-0">
                    <PulseStrip days={strips.get(s.id) ?? []} height={26} />
                  </div>

                  <dl className="grid grid-cols-3 gap-4 text-sm lg:contents">
                    <div className="lg:text-right">
                      <dt className="text-xs text-muted lg:sr-only">Uptime {DAYS} g</dt>
                      <dd className="tabular">{percent(s.uptime_30d)}</dd>
                    </div>
                    <div className="lg:text-right">
                      <dt className="text-xs text-muted lg:sr-only">p95 24 h</dt>
                      <dd className="tabular">{ms(s.p95_ms_24h)}</dd>
                    </div>
                    <div className="lg:text-right">
                      <dt className="text-xs text-muted lg:sr-only">Certificato SSL</dt>
                      <dd>
                        <SslDays days={s.ssl_days_left} />
                      </dd>
                    </div>
                  </dl>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="max-w-3xl">
        <SectionHead title="Ultimi disservizi" />
        <IncidentList incidents={incidents.slice(0, 8)} />
      </section>
    </div>
  );
}

function Headline({
  items,
  total,
  lastCheck,
}: {
  items: { site: SiteOverview; kind: StatusKind }[];
  total: number;
  lastCheck: string | null;
}) {
  const names = (k: StatusKind) => items.filter((x) => x.kind === k).map((x) => x.site.name);
  const down = names("down");
  const partial = names("partial");
  const slow = names("warn");
  const waiting = names("nodata");

  let kind: StatusKind = "ok";
  let title = `Tutti i ${total} siti rispondono.`;
  if (total === 1) title = "Il sito risponde.";
  if (down.length) {
    kind = "down";
    title = down.length === 1 ? `${down[0]} non risponde.` : `${down.length} siti non rispondono.`;
  } else if (partial.length) {
    kind = "partial";
    title = partial.length === 1 ? `${partial[0]} è instabile.` : `${partial.length} siti sono instabili.`;
  } else if (slow.length) {
    kind = "warn";
    title = `I siti rispondono, ${slow.length === 1 ? `${slow[0]} è lento` : `${slow.length} sono lenti`}.`;
  } else if (waiting.length === total) {
    kind = "nodata";
    title = "In attesa del primo controllo.";
  }

  // il resto della situazione, in una frase: chi è giù lo dice già il titolo
  const extra: string[] = [];
  if (down.length > 1) extra.push(`Giù: ${down.join(", ")}.`);
  if (down.length && partial.length) extra.push(`Instabili: ${partial.join(", ")}.`);
  if ((down.length || partial.length) && slow.length) extra.push(`Lenti: ${slow.join(", ")}.`);
  if (partial.length > 1 && !down.length) extra.push(`Instabili: ${partial.join(", ")}.`);

  return (
    <section className="max-w-4xl">
      <div className="flex items-center gap-3">
        <StatusShape kind={kind} size={18} />
        <span className="text-sm text-ink-2">
          Ultimo controllo {timeAgo(lastCheck)}. Si controlla una volta all&apos;ora.
        </span>
      </div>
      <h1 className="mt-4 font-display text-4xl leading-[1.05] font-semibold tracking-tight text-balance sm:text-6xl">
        {title}
      </h1>
      {extra.length > 0 && <p className="mt-4 max-w-2xl text-lg text-ink-2">{extra.join(" ")}</p>}
    </section>
  );
}
