import Link from "next/link";
import { notFound } from "next/navigation";

import { ApiDown, IncidentList } from "@/components/Blocks";
import { ResponseChart } from "@/components/ResponseChart";
import { Stat } from "@/components/Status";
import { api, ApiError } from "@/lib/api";
import { dateTime, host, ms, percent, timeAgo } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function SitePage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id < 1) notFound();

  let data;
  try {
    const [site, series, transitions, incidents] = await Promise.all([
      api.site(id),
      api.series(id, 72),
      api.transitions(id),
      api.incidents(id),
    ]);
    data = { site, series, transitions, incidents };
  } catch (e) {
    if (e instanceof ApiError && e.message === "not-found") notFound();
    return <ApiDown message={e instanceof ApiError ? e.message : "Errore sconosciuto"} />;
  }
  const { site, series, transitions, incidents } = data;

  return (
    <div className="space-y-8">
      <div>
        <Link href="/" className="text-sm text-ink-2 hover:underline">
          ← Tutti i siti
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{site.name}</h1>
        <a href={site.url} className="text-sm text-ink-2 hover:underline" target="_blank" rel="noreferrer">
          {host(site.url)} ↗
        </a>
      </div>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Uptime 30 giorni" value={percent(site.uptime_30d)} hint={`${site.checks_30d} controlli`} />
        <Stat label="Tempo mediano 7 g" value={ms(site.p50_ms_7d)} hint="metà delle risposte è più veloce" />
        <Stat label="p95 7 giorni" value={ms(site.p95_ms_7d)} hint="95 risposte su 100 sono più veloci" />
        <Stat label="Ultimo controllo" value={timeAgo(site.last_checked_at)} hint={dateTime(site.last_checked_at)} />
      </section>

      <section className="rounded-lg border border-line bg-surface p-4">
        <h2 className="font-medium">Tempi di risposta · ultime 72 ore</h2>
        <div className="mt-4">
          <ResponseChart points={series} />
        </div>
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="rounded-lg border border-line bg-surface">
          <h2 className="border-b border-line px-4 py-3 font-medium">Incidenti</h2>
          <IncidentList incidents={incidents} showSite={false} />
        </section>

        <section className="rounded-lg border border-line bg-surface">
          <h2 className="border-b border-line px-4 py-3 font-medium">Cambi di stato</h2>
          {transitions.length === 0 ? (
            <p className="px-4 py-6 text-ink-2">Nessun cambio di stato registrato.</p>
          ) : (
            <ul>
              {transitions.map((t) => (
                <li key={t.checked_at} className="flex items-baseline justify-between gap-4 border-b border-line px-4 py-3 last:border-0">
                  <span className={t.is_up ? "text-sm text-good-ink" : "text-sm font-medium text-bad-ink"}>
                    {t.is_up ? "● Tornato online" : "▲ Andato giù"}
                  </span>
                  <span className="text-sm text-ink-2">{dateTime(t.checked_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
