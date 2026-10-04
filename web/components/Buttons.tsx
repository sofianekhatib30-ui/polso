"use client";

import { useState } from "react";

// Copia un testo negli appunti e lo conferma per due secondi.
export function CopyButton({ text, label = "Copia" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 2000);
        } catch {
          /* appunti non disponibili (pagina non sicura): il testo resta selezionabile a mano */
        }
      }}
      className="shrink-0 rounded-full border border-line px-3 py-1 text-sm text-ink-2 transition-colors hover:border-accent hover:text-ink"
      aria-live="polite"
    >
      {done ? "Copiato" : label}
    </button>
  );
}

// Apre la stampa del browser: da lì si stampa o si salva in PDF.
export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-surface transition-opacity hover:opacity-90"
    >
      Stampa o salva in PDF
    </button>
  );
}
