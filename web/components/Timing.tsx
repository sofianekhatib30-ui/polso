// "Dove va il tempo": il tempo di risposta scomposto in redirect, attesa del server e download.
// Mediana delle ultime 24 ore, con una diagnosi in parole semplici su cosa conviene sistemare.

import type { Timing } from "@/lib/api";
import { ms } from "@/lib/format";

import { StatusShape } from "./Status";

const PARTS = [
  {
    key: "redirect_ms",
    label: "Redirect",
    explain: "passaggi da un indirizzo all'altro prima della pagina vera",
    color: "color-mix(in srgb, var(--accent) 45%, transparent)",
  },
  {
    key: "wait_ms",
    label: "Attesa del server",
    explain: "connessione sicura e tempo per preparare la pagina",
    color: "var(--accent)",
  },
  {
    key: "download_ms",
    label: "Download",
    explain: "scaricare la pagina",
    color: "var(--ink-2)",
  },
] as const;

function kb(bytes: number | null): string {
  if (bytes === null) return "—";
  if (bytes < 1024) return `${bytes} byte`;
  const k = bytes / 1024;
  return k < 1024 ? `${Math.round(k).toLocaleString("it-IT")} KB` : `${(k / 1024).toLocaleString("it-IT", { maximumFractionDigits: 1 })} MB`;
}

// Cosa conviene sistemare, in ordine di peso. Soglie volutamente semplici.
function diagnosis(t: Timing): string[] {
  const out: string[] = [];
  if ((t.redirect_ms ?? 0) >= 300) {
    out.push(
      `I redirect costano ${ms(t.redirect_ms)}${t.redirects ? ` (${t.redirects} ${t.redirects === 1 ? "passaggio" : "passaggi"})` : ""}: ` +
        "se il primo indirizzo rimanda sempre allo stesso posto, conviene dichiararlo nella configurazione così lo fa la CDN all'istante.",
    );
  }
  if ((t.wait_ms ?? 0) >= 800) {
    out.push(
      `Il server ci mette ${ms(t.wait_ms)} a rispondere: la pagina viene probabilmente generata a ogni visita, o la funzione parte "a freddo". ` +
        "Se non mostra dati personali, si può rendere statica.",
    );
  }
  if ((t.size_bytes ?? 0) >= 500 * 1024) {
    out.push(
      `La pagina pesa ${kb(t.size_bytes)}: su un telefono con rete mobile si sente. Spesso sono immagini incorporate nel codice invece che file separati.`,
    );
  }
  return out;
}

export function TimingBreakdown({ timing }: { timing: Timing }) {
  if (!timing.samples || timing.wait_ms === null) {
    return <p className="py-4 text-ink-2">La scomposizione compare dal prossimo controllo: serve il checker aggiornato.</p>;
  }
  const values = PARTS.map((p) => timing[p.key] ?? 0);
  const total = values.reduce((a, b) => a + b, 0) || 1;
  const notes = diagnosis(timing);

  return (
    <div>
      <div
        role="img"
        aria-label={`Tempo tipico ${ms(total)}: ${PARTS.map((p, i) => `${p.label.toLowerCase()} ${ms(values[i])}`).join(", ")}.`}
        className="flex h-4 w-full overflow-hidden rounded-full bg-surface-2"
      >
        {PARTS.map((p, i) =>
          values[i] > 0 ? (
            <div key={p.key} style={{ width: `${(values[i] / total) * 100}%`, background: p.color }} title={`${p.label}: ${ms(values[i])}`} />
          ) : null,
        )}
      </div>

      <dl className="mt-4 grid gap-4 sm:grid-cols-4">
        {PARTS.map((p, i) => (
          <div key={p.key}>
            <dt className="flex items-center gap-2 text-sm text-ink-2">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: p.color }} aria-hidden="true" />
              {p.label}
            </dt>
            <dd className="tabular mt-0.5 font-display text-2xl font-semibold tracking-tight">{ms(values[i])}</dd>
            <dd className="text-xs text-muted">{p.explain}</dd>
          </div>
        ))}
        <div>
          <dt className="text-sm text-ink-2">Peso della pagina</dt>
          <dd className="tabular mt-0.5 font-display text-2xl font-semibold tracking-tight">{kb(timing.size_bytes)}</dd>
          <dd className="text-xs text-muted">solo l&apos;HTML, senza immagini e script esterni</dd>
        </div>
      </dl>

      {notes.length > 0 ? (
        <ul className="mt-5 space-y-2">
          {notes.map((n) => (
            <li key={n} className="flex gap-2 text-sm text-ink-2">
              <span className="pt-1">
                <StatusShape kind="warn" />
              </span>
              {n}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-5 flex items-center gap-2 text-sm text-ink-2">
          <StatusShape kind="ok" /> Niente da sistemare: redirect, server e peso della pagina sono nella norma.
        </p>
      )}

      <p className="mt-4 text-xs text-muted">
        Mediana di {timing.samples} controlli nelle ultime 24 ore. I controlli partono dai server di GitHub negli Stati
        Uniti: i tempi assoluti sono più alti di quelli che vede un utente in Italia, i confronti tra siti restano validi.
      </p>
    </div>
  );
}
