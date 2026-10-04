// Blocchi per i controlli "di contorno": header di sicurezza, scadenze, attività programmate.

import type { Heartbeat, SecurityHeader } from "@/lib/api";
import { dateLong, duration, every, timeAgo } from "@/lib/format";

import { StatusShape, type StatusKind } from "./Status";

// Ogni header spiegato in parole semplici: chi legge non deve per forza sapere cos'è un header HTTP.
export const SECURITY: { key: SecurityHeader; title: string; header: string; why: string }[] = [
  {
    key: "hsts",
    title: "HTTPS sempre",
    header: "Strict-Transport-Security",
    why: "Il browser usa sempre la connessione cifrata, anche se qualcuno scrive http:// o segue un link vecchio.",
  },
  {
    key: "csp",
    title: "Regole sui contenuti",
    header: "Content-Security-Policy",
    why: "Il sito dichiara da dove possono arrivare script e immagini: se qualcuno prova a iniettare codice, il browser lo blocca.",
  },
  {
    key: "nosniff",
    title: "Tipi di file rispettati",
    header: "X-Content-Type-Options",
    why: "Il browser non prova a indovinare il tipo di un file: un'immagine caricata non può essere eseguita come programma.",
  },
  {
    key: "frame",
    title: "Niente cornici altrui",
    header: "X-Frame-Options o frame-ancestors",
    why: "Un altro sito non può mostrare queste pagine dentro una cornice invisibile per far cliccare le persone a loro insaputa.",
  },
  {
    key: "referrer",
    title: "Provenienza riservata",
    header: "Referrer-Policy",
    why: "Quando si apre un link esterno, il sito non passa l'indirizzo completo della pagina da cui si arriva.",
  },
  {
    key: "permissions",
    title: "Permessi limitati",
    header: "Permissions-Policy",
    why: "Il sito dichiara se usa fotocamera, microfono o posizione: gli script di terzi non possono chiederli di nascosto.",
  },
];

export function SecurityList({ present }: { present: SecurityHeader[] | null }) {
  if (present === null) {
    return <p className="py-4 text-ink-2">Gli header si leggono quando il sito risponde: in attesa del prossimo controllo.</p>;
  }
  return (
    <ul className="divide-y divide-line">
      {SECURITY.map((h) => {
        const ok = present.includes(h.key);
        return (
          <li key={h.key} className="grid grid-cols-[1.25rem_1fr_auto] gap-x-3 py-3.5">
            <span className="pt-1">
              {ok ? (
                <StatusShape kind="ok" size={11} />
              ) : (
                <svg width="11" height="11" viewBox="0 0 10 10" aria-hidden="true">
                  <circle cx="5" cy="5" r="4" fill="none" stroke="var(--muted)" strokeWidth="1.3" />
                </svg>
              )}
            </span>
            <div className="min-w-0">
              <div className="font-medium text-ink">{h.title}</div>
              <p className="mt-0.5 text-sm text-ink-2">{h.why}</p>
              <p className="mt-1 text-xs text-muted">{h.header}</p>
            </div>
            <span className={`pt-0.5 text-sm ${ok ? "text-ok-ink" : "text-muted"}`}>{ok ? "Presente" : "Manca"}</span>
          </li>
        );
      })}
    </ul>
  );
}

export function securityScore(present: SecurityHeader[] | null): string {
  return present === null ? "—" : `${present.length} su ${SECURITY.length}`;
}

// Una riga "cosa · quando scade · stato", per certificato e dominio
export function ExpiryRow({
  title,
  explain,
  days,
  warnAt,
  detail,
  empty,
  override,
}: {
  title: string;
  explain: string;
  days: number | null;
  warnAt: number;
  detail?: string;
  empty: string;
  override?: { kind: StatusKind; text: string };
}) {
  let kind: StatusKind = "nodata";
  let text = empty;
  if (override) {
    ({ kind, text } = override);
  } else if (days !== null) {
    kind = days < 0 ? "down" : days <= warnAt ? "warn" : "ok";
    text = days < 0 ? "Scaduto" : days === 0 ? "Scade oggi" : `Scade tra ${days} ${days === 1 ? "giorno" : "giorni"}`;
  }
  const ink = { ok: "text-ok-ink", warn: "text-warn-ink", down: "text-down-ink", partial: "", nodata: "text-muted" }[kind];
  return (
    <li className="grid grid-cols-[1.25rem_1fr] gap-x-3 py-3.5 sm:grid-cols-[1.25rem_1fr_auto]">
      <span className="pt-1">
        <StatusShape kind={kind} size={11} />
      </span>
      <div className="min-w-0">
        <div className="font-medium text-ink">{title}</div>
        <p className="mt-0.5 text-sm text-ink-2">{explain}</p>
        {detail && <p className="mt-1 text-xs text-muted">{detail}</p>}
      </div>
      <span className={`col-start-2 mt-1 text-sm font-medium sm:col-start-auto sm:mt-0 sm:pt-0.5 sm:text-right ${ink}`}>{text}</span>
    </li>
  );
}

const HB: Record<Heartbeat["status"], { kind: StatusKind; word: string; ink: string }> = {
  ok: { kind: "ok", word: "In regola", ink: "text-ok-ink" },
  late: { kind: "down", word: "In ritardo", ink: "text-down-ink font-medium" },
  waiting: { kind: "nodata", word: "In attesa del primo segnale", ink: "text-muted" },
};

export function HeartbeatList({ items }: { items: Heartbeat[] }) {
  return (
    <ul className="divide-y divide-line">
      {items.map((h) => (
        <li key={h.slug} className="grid grid-cols-[1.25rem_1fr] gap-x-3 py-3.5 sm:grid-cols-[1.25rem_1fr_auto]">
          <span className="pt-1">
            <StatusShape kind={HB[h.status].kind} size={11} />
          </span>
          <div className="min-w-0">
            <div className="font-medium text-ink">{h.name}</div>
            <p className="mt-0.5 text-sm text-ink-2">
              Deve farsi sentire {every(h.period_min)}
              {h.grace_min ? `, con ${duration(h.grace_min)} di tolleranza` : ""}.{" "}
              {h.last_ping_at ? `Ultimo segnale ${timeAgo(h.last_ping_at)} (${dateLong(h.last_ping_at)}).` : ""}
            </p>
          </div>
          <span className={`col-start-2 mt-1 text-sm sm:col-start-auto sm:mt-0 sm:pt-0.5 ${HB[h.status].ink}`}>{HB[h.status].word}</span>
        </li>
      ))}
    </ul>
  );
}
