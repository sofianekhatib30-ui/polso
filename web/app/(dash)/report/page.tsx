// Report mensile: da stampare o salvare in PDF e mandare al cliente.

import type { Metadata } from "next";
import Link from "next/link";

import { ApiDown, SectionHead, StatRow } from "@/components/Blocks";
import { PrintButton } from "@/components/Buttons";
import { SiteIcon } from "@/components/SiteIcon";
import { Logo } from "@/components/Logo";
import { StatusShape } from "@/components/Status";
import { api, ApiError, type Client, type Report } from "@/lib/api";
import { dateTime, duration, host, monthLabel, ms, percent } from "@/lib/format";
import { lastMonths, todayLong } from "@/lib/site";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Report mensile · Polso" };

export default async function ReportPage({ searchParams }: { searchParams: Promise<{ mese?: string; cliente?: string }> }) {
  const sp = await searchParams;
  const months = lastMonths(12);
  const month = sp.mese && months.includes(sp.mese) ? sp.mese : months[0];
  const clientSlug = sp.cliente || undefined;

  let report: Report;
  let clients: Client[];
  try {
    [report, clients] = await Promise.all([api.report(month, clientSlug), api.clients()]);
  } catch (e) {
    if (e instanceof ApiError && e.message === "not-found") {
      return <ApiDown message={`Il cliente “${clientSlug}” non esiste o non ha siti attivi`} />;
    }
    return <ApiDown message={e instanceof ApiError ? e.message : "Errore sconosciuto"} />;
  }
  const clientName = clients.find((c) => c.slug === clientSlug)?.name;
  const current = month === months[0];
  const label = monthLabel(month);

  return (
    <div className="space-y-12">
      <form className="flex flex-wrap items-end gap-3 print:hidden" action="/report">
        <label className="grid gap-1 text-sm text-ink-2">
          Mese
          <select name="mese" defaultValue={month} className="h-10 rounded-lg border border-line bg-surface px-3 text-ink">
            {months.map((m) => (
              <option key={m} value={m}>
                {monthLabel(m)}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm text-ink-2">
          Cliente
          <select
            name="cliente"
            defaultValue={clientSlug ?? ""}
            className="h-10 rounded-lg border border-line bg-surface px-3 text-ink"
          >
            <option value="">Tutti i siti</option>
            {clients.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="h-10 rounded-full border border-line px-4 text-sm text-ink hover:border-accent">
          Mostra il report
        </button>
        <span className="ml-auto">
          <PrintButton />
        </span>
      </form>

      <section className="max-w-4xl">
        <div className="mb-8 hidden items-center gap-2 text-sm text-muted print:flex">
          <Logo size={16} animated={false} /> polso, monitor dei siti di K Digital Solution
        </div>
        <p className="text-ink-2">{clientName ?? "Tutti i siti monitorati"}</p>
        <h1 className="mt-2 font-display text-4xl leading-[1.05] font-semibold tracking-tight sm:text-6xl">
          Report di {label}
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-ink-2">{summary(report)}</p>
        <p className="mt-3 text-sm text-muted">
          {current ? "Mese in corso: i dati arrivano fino a oggi. " : ""}Generato il {todayLong()}.
        </p>
      </section>

      <StatRow
        items={[
          { label: "Disponibilità", value: percent(report.uptime), hint: "controlli riusciti sul totale" },
          { label: "Controlli fatti", value: report.checks.toLocaleString("it-IT"), hint: "uno ogni 15 minuti per sito" },
          { label: "Interruzioni", value: report.incidents },
          { label: "Tempo fuori servizio", value: report.downtime_min ? duration(report.downtime_min) : "0 min" },
        ]}
      />

      <section>
        <SectionHead title="Sito per sito" />
        <div className="overflow-x-auto rounded-xl border border-line bg-surface print:overflow-visible">
          <table className="w-full min-w-[720px] text-sm print:min-w-0">
            <thead className="text-left text-ink-2">
              <tr className="border-b border-line">
                <th className="px-4 py-2.5 font-normal">Sito</th>
                <th className="px-4 py-2.5 text-right font-normal">Disponibilità</th>
                <th className="px-4 py-2.5 text-right font-normal">Interruzioni</th>
                <th className="px-4 py-2.5 text-right font-normal">Fuori servizio</th>
                <th className="px-4 py-2.5 text-right font-normal">La più lunga</th>
                <th className="px-4 py-2.5 text-right font-normal">Tempo tipico</th>
                <th className="px-4 py-2.5 text-right font-normal">p95</th>
              </tr>
            </thead>
            <tbody>
              {report.sites.map((s) => (
                <tr key={s.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <SiteIcon src={s.icon_url} name={s.name} size={24} />
                      <div>
                        <Link href={`/sites/${s.id}`} className="font-medium text-ink hover:text-accent">
                          {s.name}
                        </Link>
                        <div className="text-xs text-muted">
                          <a href={s.url} target="_blank" rel="noreferrer" className="hover:text-accent">
                            {host(s.url)}
                          </a>
                          {!clientSlug && s.client_name ? `, ${s.client_name}` : ""}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="tabular px-4 py-3 text-right whitespace-nowrap">{s.checks ? percent(s.uptime) : "nessun dato"}</td>
                  <td className="tabular px-4 py-3 text-right whitespace-nowrap">{s.incidents}</td>
                  <td className="tabular px-4 py-3 text-right whitespace-nowrap">{s.downtime_min ? duration(s.downtime_min) : "—"}</td>
                  <td className="tabular px-4 py-3 text-right whitespace-nowrap">{s.longest_min ? duration(s.longest_min) : "—"}</td>
                  <td className="tabular px-4 py-3 text-right whitespace-nowrap">{ms(s.p50_ms)}</td>
                  <td className="tabular px-4 py-3 text-right whitespace-nowrap">{ms(s.p95_ms)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted">
          Tempo tipico: metà delle risposte è più veloce di questo valore. p95: 95 risposte su 100 sono più veloci.
        </p>
      </section>

      <section className="max-w-3xl">
        <SectionHead title="Diario delle interruzioni" />
        {report.incident_list.length === 0 ? (
          <p className="flex items-center gap-2 text-ink-2">
            <StatusShape kind="ok" /> Nessuna interruzione in {label}.
          </p>
        ) : (
          <ol className="divide-y divide-line">
            {report.incident_list.map((i) => (
              <li key={i.id} className="grid grid-cols-[1.25rem_1fr_auto] gap-x-3 py-3.5">
                <span className="pt-1">
                  <StatusShape kind={i.resolved_at ? "ok" : "down"} size={11} />
                </span>
                <div>
                  <div className="font-medium text-ink">{i.site_name}</div>
                  <div className="text-sm text-ink-2">
                    Dal {dateTime(i.started_at)}
                    {i.resolved_at ? ` al ${dateTime(i.resolved_at)}` : ", ancora in corso"}
                    {i.cause ? `. Causa: ${i.cause}` : ""}
                  </div>
                </div>
                <span className="tabular text-sm text-ink-2">{duration(i.duration_min)}</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <p className="max-w-3xl border-t border-line pt-6 text-xs leading-relaxed text-muted">
        Come si misura: ogni sito viene controllato ogni 15 minuti da un servizio esterno. Un controllo riesce se il sito
        risponde entro 15 secondi con una pagina valida. Un&apos;interruzione inizia dopo due controlli falliti di fila e
        finisce al primo controllo riuscito; la durata è quindi precisa al quarto d&apos;ora. Orari nel fuso di Roma.
      </p>
    </div>
  );
}

function summary(r: Report): string {
  if (!r.checks) return "Nessun controllo registrato in questo mese.";
  const base = `I siti sono stati raggiungibili il ${percent(r.uptime)} del tempo`;
  if (!r.incidents) return `${base}, senza interruzioni.`;
  return `${base}, con ${r.incidents} ${r.incidents === 1 ? "interruzione" : "interruzioni"} per un totale di ${duration(r.downtime_min)}.`;
}
