import Link from "next/link";

import type { Incident } from "@/lib/api";
import { dateTime, duration } from "@/lib/format";

import { StatusShape } from "./Status";

// Numeri chiave in riga, separati da un filetto: niente "card" una accanto all'altra.
export type StatItem = { label: string; value: React.ReactNode; hint?: string };

export function StatRow({ items }: { items: StatItem[] }) {
  return (
    <dl className="grid grid-cols-2 gap-y-6 border-y border-line py-5 md:grid-cols-4 md:py-6">
      {items.map((s, i) => (
        <div
          key={s.label}
          className={[
            "pr-4 md:pr-6",
            i === 0 ? "pl-0" : i % 2 === 0 ? "pl-0 md:border-l md:border-line md:pl-6" : "border-l border-line pl-4 md:pl-6",
          ].join(" ")}
        >
          <dt className="text-sm text-ink-2">{s.label}</dt>
          <dd className="tabular mt-1 font-display text-3xl font-semibold tracking-tight text-ink">{s.value}</dd>
          {s.hint && <dd className="mt-0.5 text-xs text-muted">{s.hint}</dd>}
        </div>
      ))}
    </dl>
  );
}

export function SectionHead({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
      <h2 className="font-display text-xl font-semibold tracking-tight">{title}</h2>
      {children}
    </div>
  );
}

export function IncidentList({ incidents, showSite = true }: { incidents: Incident[]; showSite?: boolean }) {
  if (incidents.length === 0) {
    return (
      <p className="flex items-center gap-2 py-4 text-ink-2">
        <StatusShape kind="ok" /> Nessun disservizio registrato finora.
      </p>
    );
  }
  return (
    <ol className="relative">
      {incidents.map((i) => {
        const open = !i.resolved_at;
        return (
          <li key={i.id} className="grid grid-cols-[1.25rem_1fr] gap-x-3 border-b border-line py-3.5 last:border-0">
            <span className="pt-1">
              <StatusShape kind={open ? "down" : "ok"} size={11} />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                {showSite && (
                  <Link href={`/sites/${i.site_id}`} className="font-medium text-ink hover:text-accent">
                    {i.site_name}
                  </Link>
                )}
                <span className={open ? "text-sm font-medium text-down-ink" : "text-sm text-ok-ink"}>
                  {open ? `Giù da ${duration(i.duration_min)}` : `Risolto dopo ${duration(i.duration_min)}`}
                </span>
              </div>
              <div className="mt-0.5 text-sm text-muted">
                Iniziato {dateTime(i.started_at)}
                {i.cause ? `, causa: ${i.cause}` : ""}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function ApiDown({ message }: { message: string }) {
  return (
    <div className="max-w-xl">
      <div className="flex items-center gap-2 text-down-ink">
        <StatusShape kind="down" size={12} />
        <span className="font-medium">Dati non disponibili</span>
      </div>
      <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight">Polso non riesce a leggere le misure.</h1>
      <p className="mt-3 text-ink-2">
        {message}. Controlla che l&apos;API sia avviata e che POLSO_API_URL punti all&apos;indirizzo giusto, poi
        ricarica la pagina.
      </p>
    </div>
  );
}
