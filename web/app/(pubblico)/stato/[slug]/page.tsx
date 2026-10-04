// Pagina di stato per un cliente: la può aprire chiunque abbia il link.
// Linguaggio semplice, niente p95 o header: solo "funziona?" e "cosa è successo?".

import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ApiDown } from "@/components/Blocks";
import { PulseLegend, PulseStrip } from "@/components/PulseStrip";
import { SiteIcon } from "@/components/SiteIcon";
import { StatusShape, statusInk, statusOf, type StatusKind } from "@/components/Status";
import { api, ApiError, type DayPoint } from "@/lib/api";
import { dateTime, duration, host, percent, timeAgo } from "@/lib/format";
import { withinDays } from "@/lib/site";

export const dynamic = "force-dynamic";

const WORD: Record<StatusKind, string> = {
  ok: "Funziona",
  warn: "Funziona, ma risponde lentamente",
  partial: "Funziona a tratti",
  down: "Non raggiungibile",
  nodata: "In attesa del primo controllo",
};

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  try {
    const c = await api.client((await params).slug);
    return { title: `Stato dei servizi · ${c.name}`, robots: { index: false } };
  } catch {
    return { title: "Stato dei servizi" };
  }
}

export default async function ClientStatusPage({ params }: { params: Promise<{ slug: string }> }) {
  const slug = (await params).slug;
  let data;
  try {
    const [client, sites, daily, incidents] = await Promise.all([
      api.client(slug),
      api.sites(slug),
      api.daily(90, { client: slug }),
      api.incidents({ client: slug }, 50),
    ]);
    data = { client, sites, daily, incidents };
  } catch (e) {
    if (e instanceof ApiError && e.message === "not-found") notFound();
    return <ApiDown message={e instanceof ApiError ? e.message : "Errore sconosciuto"} />;
  }
  const { client, sites, daily, incidents } = data;

  const strips = new Map<number, DayPoint[]>();
  for (const d of daily) strips.set(d.site_id, [...(strips.get(d.site_id) ?? []), d]);
  const kinds = sites.map((s) => statusOf(s));
  const broken = sites.filter((_, i) => kinds[i] === "down" || kinds[i] === "partial");
  const recent = incidents.filter((i) => !i.resolved_at || withinDays(i.started_at, 30));
  const lastCheck = sites.reduce<string | null>(
    (max, s) => (s.last_checked_at && (!max || s.last_checked_at > max) ? s.last_checked_at : max),
    null,
  );

  const headline =
    broken.length === 0
      ? sites.length === 1
        ? "Il servizio funziona regolarmente."
        : "Tutti i servizi funzionano regolarmente."
      : broken.length === 1
        ? `${broken[0].name} ha un problema in corso.`
        : `${broken.length} servizi hanno un problema in corso.`;

  return (
    <div className="space-y-14">
      <section>
        <p className="text-ink-2">Stato dei servizi di {client.name}</p>
        <div className="mt-4 flex items-start gap-4">
          <span className="pt-3 sm:pt-4">
            <StatusShape kind={broken.length ? "down" : "ok"} size={20} />
          </span>
          <h1 className="font-display text-4xl leading-[1.05] font-semibold tracking-tight text-balance sm:text-5xl">
            {headline}
          </h1>
        </div>
        <p className="mt-4 text-sm text-muted">
          Aggiornato {timeAgo(lastCheck)}. Ogni sito viene controllato automaticamente ogni 15 minuti.
        </p>
      </section>

      <section>
        <ul className="space-y-8">
          {sites.map((s, i) => {
            const days = strips.get(s.id) ?? [];
            const checks = days.reduce((a, d) => a + d.checks, 0);
            const up = days.reduce((a, d) => a + d.up, 0);
            return (
              <li key={s.id}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <div className="flex items-center gap-3">
                    <SiteIcon src={s.icon_url} name={s.name} size={36} />
                    <div>
                      <h2 className="font-display text-xl font-semibold tracking-tight">{s.name}</h2>
                      <a
                        href={s.url}
                        className="text-sm text-muted underline decoration-line underline-offset-2 hover:text-accent"
                        target="_blank"
                        rel="noreferrer"
                      >
                        {host(s.url)}
                      </a>
                    </div>
                  </div>
                  <span className={`inline-flex items-center gap-1.5 text-sm font-medium ${statusInk(kinds[i])}`}>
                    <StatusShape kind={kinds[i]} />
                    {WORD[kinds[i]]}
                  </span>
                </div>
                <div className="mt-3">
                  <PulseStrip days={days} height={36} />
                </div>
                <div className="mt-2 flex justify-between text-xs text-muted">
                  <span>90 giorni fa</span>
                  <span>
                    {checks ? `Disponibile il ${percent((100 * up) / checks)} del tempo` : "Nessun controllo ancora"}
                  </span>
                  <span>oggi</span>
                </div>
              </li>
            );
          })}
        </ul>
        <div className="mt-6">
          <PulseLegend />
        </div>
      </section>

      <section>
        <h2 className="font-display text-xl font-semibold tracking-tight">Ultimi 30 giorni</h2>
        {recent.length === 0 ? (
          <p className="mt-3 flex items-center gap-2 text-ink-2">
            <StatusShape kind="ok" /> Nessuna interruzione negli ultimi 30 giorni.
          </p>
        ) : (
          <ol className="mt-3 divide-y divide-line">
            {recent.map((inc) => (
              <li key={inc.id} className="grid grid-cols-[1.25rem_1fr] gap-x-3 py-3.5">
                <span className="pt-1">
                  <StatusShape kind={inc.resolved_at ? "ok" : "down"} size={11} />
                </span>
                <p className="text-ink-2">
                  <span className="font-medium text-ink">{inc.site_name}</span>{" "}
                  {inc.resolved_at
                    ? `non è stato raggiungibile dal ${dateTime(inc.started_at)} per ${duration(inc.duration_min)}. Risolto.`
                    : `non è raggiungibile dal ${dateTime(inc.started_at)}. Il problema è in corso.`}
                </p>
              </li>
            ))}
          </ol>
        )}
      </section>

      <p className="border-t border-line pt-6 text-xs text-muted">
        Un&apos;interruzione viene registrata dopo due controlli falliti di fila, per non contare i disturbi di rete di
        pochi secondi.
      </p>
    </div>
  );
}
