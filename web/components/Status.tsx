// Stato di un sito: sempre forma + parola + colore, mai il solo colore.
//   Online      cerchio pieno      azzurro
//   Lento       rombo              giallo
//   Instabile   triangolo          arancio
//   Giù         quadrato con croce rosso
//   Nessun dato cerchio tratteggiato grigio

import type { SiteOverview } from "@/lib/api";

export type StatusKind = "ok" | "warn" | "partial" | "down" | "nodata";

export const SLOW_MS = 3000;

const LABEL: Record<StatusKind, string> = {
  ok: "Online",
  warn: "Lento",
  partial: "Instabile",
  down: "Giù",
  nodata: "Nessun dato",
};

const INK: Record<StatusKind, string> = {
  ok: "text-ok-ink",
  warn: "text-warn-ink",
  partial: "text-partial-ink",
  down: "text-down-ink",
  nodata: "text-muted",
};

export function statusOf(s: Pick<SiteOverview, "is_up" | "open_incident" | "response_ms">): StatusKind {
  if (s.is_up === null) return "nodata";
  if (!s.is_up) return "down";
  if (s.open_incident) return "partial";
  if (s.response_ms !== null && s.response_ms > SLOW_MS) return "warn";
  return "ok";
}

export function StatusShape({ kind, size = 10 }: { kind: StatusKind; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 10 10", "aria-hidden": true as const };
  switch (kind) {
    case "ok":
      return (
        <svg {...common}>
          <circle cx="5" cy="5" r="4.5" fill="var(--ok)" />
        </svg>
      );
    case "warn":
      return (
        <svg {...common}>
          <path d="M5 0.3 9.7 5 5 9.7 0.3 5z" fill="var(--warn)" />
        </svg>
      );
    case "partial":
      return (
        <svg {...common}>
          <path d="M5 0.6 9.6 9.2H0.4z" fill="var(--partial)" />
        </svg>
      );
    case "down":
      return (
        <svg {...common}>
          <rect x="0.5" y="0.5" width="9" height="9" rx="1.5" fill="var(--down)" />
          <path d="M3 3l4 4M7 3l-4 4" stroke="var(--surface)" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <circle cx="5" cy="5" r="4" fill="none" stroke="var(--muted)" strokeWidth="1.2" strokeDasharray="2 1.6" />
        </svg>
      );
  }
}

export function Status({ kind, className = "" }: { kind: StatusKind; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-sm font-medium ${INK[kind]} ${className}`}>
      <StatusShape kind={kind} />
      {LABEL[kind]}
    </span>
  );
}

export function statusLabel(kind: StatusKind): string {
  return LABEL[kind];
}

export function statusInk(kind: StatusKind): string {
  return INK[kind];
}

export function SslDays({ days }: { days: number | null }) {
  if (days === null) return <span className="text-muted">—</span>;
  if (days < 0) {
    return (
      <span className="inline-flex items-center gap-1 font-medium text-down-ink">
        <StatusShape kind="down" size={9} /> Scaduto
      </span>
    );
  }
  if (days <= 14) {
    return (
      <span className="tabular inline-flex items-center gap-1 font-medium text-warn-ink">
        <StatusShape kind="warn" size={9} /> {days} g
      </span>
    );
  }
  return <span className="tabular">{days} g</span>;
}
