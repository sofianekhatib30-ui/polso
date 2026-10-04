// Accesso all'API di Polso. Le chiamate partono dal server Next.js, non dal browser:
// l'indirizzo dell'API resta nelle variabili d'ambiente.

export type SiteOverview = {
  id: number;
  name: string;
  url: string;
  last_checked_at: string | null;
  is_up: boolean | null;
  status_code: number | null;
  response_ms: number | null;
  uptime_24h: number | null;
  uptime_7d: number | null;
  uptime_30d: number | null;
  p95_ms_24h: number | null;
  ssl_days_left: number | null;
  open_incident: boolean;
};

export type SiteDetail = {
  id: number;
  name: string;
  url: string;
  created_at: string;
  checks_30d: number;
  uptime_30d: number | null;
  avg_ms_7d: number | null;
  p50_ms_7d: number | null;
  p95_ms_7d: number | null;
  last_checked_at: string | null;
};

export type SeriesPoint = {
  hour: string;
  checks: number;
  avg_ms: number | null;
  min_ms: number | null;
  max_ms: number | null;
  uptime: number | null;
};

export type Transition = {
  checked_at: string;
  is_up: boolean;
  status_code: number | null;
  error: string | null;
};

export type Incident = {
  id: number;
  site_id: number;
  site_name: string;
  site_url: string;
  started_at: string;
  resolved_at: string | null;
  cause: string | null;
  duration_min: number;
};

export class ApiError extends Error {}

const BASE = (process.env.POLSO_API_URL ?? "http://localhost:8000").replace(/\/$/, "");

async function get<T>(path: string): Promise<T> {
  let res: Response;
  try {
    // i dati si aggiornano al massimo una volta al minuto: la pagina resta veloce
    res = await fetch(`${BASE}${path}`, { next: { revalidate: 60 } });
  } catch {
    throw new ApiError(`API non raggiungibile (${BASE})`);
  }
  if (res.status === 404) throw new ApiError("not-found");
  if (!res.ok) throw new ApiError(`L'API ha risposto ${res.status}`);
  return (await res.json()) as T;
}

export const api = {
  sites: () => get<SiteOverview[]>("/sites"),
  site: (id: number) => get<SiteDetail>(`/sites/${id}`),
  series: (id: number, hours = 72) => get<SeriesPoint[]>(`/sites/${id}/series?hours=${hours}`),
  transitions: (id: number) => get<Transition[]>(`/sites/${id}/transitions?limit=10`),
  incidents: (siteId?: number) => get<Incident[]>(`/incidents?limit=20${siteId ? `&site_id=${siteId}` : ""}`),
};
