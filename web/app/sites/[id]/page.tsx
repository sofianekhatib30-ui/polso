import Link from "next/link";
import { notFound } from "next/navigation";

import { ApiDown, IncidentList, SectionHead, StatRow } from "@/components/Blocks";
import { PulseLegend, PulseStrip } from "@/components/PulseStrip";
import { ResponseChart } from "@/components/ResponseChart";
import { SslDays, Status, StatusShape, statusOf } from "@/components/Status";
import { api, ApiError } from "@/lib/api";
import { dateTime, host, ms, percent, timeAgo } from "@/lib/format";

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
      api.incidents(id),
      api.daily(90, id),
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
        <h1 className="mt-3 font-display text-4xl leading-[1.05] font-semibold tracking-tight break-words sm:text-6xl">
          {site.name}
        </h1>
        <a
          href={site.url}
          className="mt-2 inline-block text-ink-2 underline decoration-line underline-offset-4 hover:text-accent hover:decoration-accent"
          target="_blank"
          rel="noreferrer"
        >
          {host(site.url)}
        </a>
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
            label: "Certificato SSL",
            value: <SslDays days={now?.ssl_days_left ?? null} />,
            hint: "giorni alla scadenza",
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
