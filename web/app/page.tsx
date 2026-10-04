import Link from "next/link";

import { ApiDown, IncidentList } from "@/components/Blocks";
import { Stat, SslDays, Status } from "@/components/Status";
import { api, ApiError, type Incident, type SiteOverview } from "@/lib/api";
import { host, ms, percent, timeAgo } from "@/lib/format";

// La pagina legge sempre dati freschi dall'API (niente pagina statica al momento della build).
export const dynamic = "force-dynamic";

export default async function Home() {
  let sites: SiteOverview[];
  let incidents: Incident[];
  try {
    [sites, incidents] = await Promise.all([api.sites(), api.incidents()]);
  } catch (e) {
    return <ApiDown message={e instanceof ApiError ? e.message : "Errore sconosciuto"} />;
  }

  const online = sites.filter((s) => s.is_up && !s.open_incident).length;
  // gli incidenti aperti si contano dai siti, non dalla lista (che mostra solo gli ultimi 20)
  const open = sites.filter((s) => s.open_incident);
  const problems = sites.filter((s) => s.is_up === false || s.open_incident);
  const sslSoon = sites.filter((s) => s.ssl_days_left !== null && s.ssl_days_left <= 14);

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-2xl font-semibold tracking-tight">Stato dei siti</h1>
        <p className="mt-1 text-ink-2">
          {problems.length === 0
            ? `Tutto regolare: ${online} siti su ${sites.length} online.`
            : `${problems.length} ${problems.length === 1 ? "sito ha" : "siti hanno"} un problema in corso.`}
        </p>
      </section>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Siti online" value={`${online} / ${sites.length}`} />
        <Stat label="Incidenti aperti" value={open.length} />
        <Stat label="Certificati in scadenza" value={sslSoon.length} hint="entro 14 giorni" />
        <Stat
          label="Uptime medio 30 giorni"
          value={percent(avg(sites.map((s) => s.uptime_30d)))}
          hint="media dei siti monitorati"
        />
      </section>

      <section className="overflow-hidden rounded-lg border border-line bg-surface">
        <h2 className="border-b border-line px-4 py-3 font-medium">Siti monitorati</h2>
        {sites.length === 0 ? (
          <p className="px-4 py-6 text-ink-2">
            Nessun sito ancora. Avvia il checker: i siti compaiono al primo controllo.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="text-left text-ink-2">
                <tr className="border-b border-line">
                  <th className="px-4 py-2 font-normal">Sito</th>
                  <th className="px-4 py-2 font-normal">Stato</th>
                  <th className="px-4 py-2 text-right font-normal">Uptime 24 h</th>
                  <th className="px-4 py-2 text-right font-normal">Uptime 30 g</th>
                  <th className="px-4 py-2 text-right font-normal">p95 24 h</th>
                  <th className="px-4 py-2 text-right font-normal">SSL</th>
                  <th className="px-4 py-2 text-right font-normal">Ultimo controllo</th>
                </tr>
              </thead>
              <tbody>
                {sites.map((s) => (
                  <tr key={s.id} className="border-b border-line last:border-0 hover:bg-surface-2">
                    <td className="px-4 py-3">
                      <Link href={`/sites/${s.id}`} className="font-medium hover:underline">
                        {s.name}
                      </Link>
                      <div className="text-xs text-muted">{host(s.url)}</div>
                    </td>
                    <td className="px-4 py-3">
                      <Status isUp={s.is_up} openIncident={s.open_incident} />
                    </td>
                    <td className="tabular px-4 py-3 text-right">{percent(s.uptime_24h)}</td>
                    <td className="tabular px-4 py-3 text-right">{percent(s.uptime_30d)}</td>
                    <td className="tabular px-4 py-3 text-right">{ms(s.p95_ms_24h)}</td>
                    <td className="px-4 py-3 text-right">
                      <SslDays days={s.ssl_days_left} />
                    </td>
                    <td className="px-4 py-3 text-right text-ink-2">{timeAgo(s.last_checked_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-line bg-surface">
        <h2 className="border-b border-line px-4 py-3 font-medium">Ultimi incidenti</h2>
        <IncidentList incidents={incidents.slice(0, 8)} />
      </section>
    </div>
  );
}

function avg(values: (number | null)[]): number | null {
  const v = values.filter((x): x is number => x !== null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}
