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
  samples_24h: number;
  ssl_days_left: number | null;
  domain_days_left: number | null;
  open_incident: boolean;
  client_name: string | null;
  client_slug: string | null;
  keyword: string | null;
  icon_url: string | null;
  security_headers: SecurityHeader[] | null;
};

export type SecurityHeader = "hsts" | "csp" | "nosniff" | "frame" | "referrer" | "permissions";

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
  client_name: string | null;
  client_slug: string | null;
  keyword: string | null;
  icon_url: string | null;
  domain: string | null;
  domain_expires_at: string | null;
  domain_registrar: string | null;
  domain_checked_at: string | null;
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

export type DayPoint = {
  site_id: number;
  day: string; // YYYY-MM-DD, calendario di Roma
  checks: number;
  up: number;
  uptime: number | null; // null = nessun controllo quel giorno
};

export type Timing = {
  samples: number;
  redirect_ms: number | null;
  wait_ms: number | null;
  download_ms: number | null;
  size_bytes: number | null;
  redirects: number | null;
  /** da dove sono presi i tempi: regione di Vercel (es. "fra1"); null = dal checker su GitHub (USA) */
  origin: string | null;
  last: Record<string, number | string> | null;
};

export type Client = { slug: string; name: string; sites: number; uptime_30d: number | null };

export type Heartbeat = {
  slug: string;
  name: string;
  period_min: number;
  grace_min: number;
  last_ping_at: string | null;
  next_due_at: string | null;
  status: "ok" | "late" | "waiting";
  pings_30d: number;
};

export type ReportSite = {
  id: number;
  name: string;
  url: string;
  client_name: string | null;
  client_slug: string | null;
  icon_url: string | null;
  checks: number;
  up: number;
  uptime: number | null;
  p50_ms: number | null;
  p95_ms: number | null;
  incidents: number;
  downtime_min: number;
  longest_min: number;
};

export type Report = {
  month: string; // AAAA-MM
  client: string | null;
  checks: number;
  uptime: number | null;
  incidents: number;
  downtime_min: number;
  sites: ReportSite[];
  incident_list: Incident[];
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

// costruisce la query string saltando i valori vuoti
function qs(params: Record<string, string | number | undefined | null>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
  const s = q.toString();
  return s ? `?${s}` : "";
}

type Filter = { siteId?: number; client?: string };

export const api = {
  sites: (client?: string) => get<SiteOverview[]>(`/sites${qs({ client })}`),
  site: (id: number) => get<SiteDetail>(`/sites/${id}`),
  series: (id: number, hours = 72) => get<SeriesPoint[]>(`/sites/${id}/series?hours=${hours}`),
  transitions: (id: number) => get<Transition[]>(`/sites/${id}/transitions?limit=10`),
  timing: (id: number) => get<Timing>(`/sites/${id}/timing`),
  daily: (days: number, f: Filter = {}) =>
    get<DayPoint[]>(`/uptime/daily${qs({ days, site_id: f.siteId, client: f.client })}`),
  incidents: (f: Filter = {}, limit = 20) =>
    get<Incident[]>(`/incidents${qs({ limit, site_id: f.siteId, client: f.client })}`),
  clients: () => get<Client[]>("/clients"),
  client: (slug: string) => get<{ slug: string; name: string }>(`/clients/${encodeURIComponent(slug)}`),
  heartbeats: () => get<Heartbeat[]>("/heartbeats"),
  report: (month?: string, client?: string) => get<Report>(`/report${qs({ month, client })}`),
};

// indirizzo pubblico dell'API, per i badge da copiare nei README
export const API_PUBLIC_URL = BASE;
