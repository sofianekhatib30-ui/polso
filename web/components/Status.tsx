// Stato di un sito: sempre icona + parola, mai solo colore.

type Props = { isUp: boolean | null; openIncident?: boolean };

export function Status({ isUp, openIncident }: Props) {
  if (isUp === null) {
    return <span className="inline-flex items-center gap-1.5 text-sm text-muted">○ Nessun dato</span>;
  }
  if (!isUp || openIncident) {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-bad-ink">
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M6 1 11 10H1z" fill="var(--bad)" />
        </svg>
        {isUp ? "Instabile" : "Giù"}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-sm font-medium text-good-ink">
      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
        <circle cx="6" cy="6" r="5" fill="var(--good)" />
      </svg>
      Online
    </span>
  );
}

export function SslDays({ days }: { days: number | null }) {
  if (days === null) return <span className="text-muted">—</span>;
  if (days < 0) return <span className="font-medium text-bad-ink">▲ Scaduto</span>;
  if (days <= 14) return <span className="font-medium text-warn-ink">▲ {days} giorni</span>;
  return <span className="tabular">{days} giorni</span>;
}

export function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <div className="text-sm text-ink-2">{label}</div>
      <div className="tabular mt-1 text-2xl font-semibold tracking-tight">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </div>
  );
}
