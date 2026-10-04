import Link from "next/link";

import type { Incident } from "@/lib/api";
import { dateTime, duration } from "@/lib/format";

export function IncidentList({ incidents, showSite = true }: { incidents: Incident[]; showSite?: boolean }) {
  if (incidents.length === 0) {
    return <p className="px-4 py-6 text-ink-2">Nessun incidente registrato.</p>;
  }
  return (
    <ul>
      {incidents.map((i) => (
        <li key={i.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-line px-4 py-3 last:border-0">
          <span className={i.resolved_at ? "text-sm text-good-ink" : "text-sm font-medium text-bad-ink"}>
            {i.resolved_at ? "● Risolto" : "▲ In corso"}
          </span>
          {showSite && (
            <Link href={`/sites/${i.site_id}`} className="font-medium hover:underline">
              {i.site_name}
            </Link>
          )}
          <span className="text-sm text-ink-2">
            {dateTime(i.started_at)} · {duration(i.duration_min)}
          </span>
          {i.cause && <span className="font-mono text-xs text-muted">{i.cause}</span>}
        </li>
      ))}
    </ul>
  );
}

export function ApiDown({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface p-6">
      <h1 className="text-lg font-semibold">Dati non disponibili</h1>
      <p className="mt-2 text-ink-2">{message}. Controlla che l&apos;API sia avviata e che POLSO_API_URL sia corretto.</p>
    </div>
  );
}
