"use client";

// Icona del sito (la sua favicon). Se manca o non si carica, un quadratino con l'iniziale:
// la riga resta allineata e il sito si riconosce lo stesso.

import { useState } from "react";

export function SiteIcon({ src, name, size = 28 }: { src: string | null; name: string; size?: number }) {
  const [broken, setBroken] = useState(false);
  const box = { width: size, height: size };
  if (!src || broken) {
    return (
      <span
        aria-hidden="true"
        style={{ ...box, fontSize: size * 0.46 }}
        className="inline-flex shrink-0 items-center justify-center rounded-md bg-accent-soft font-display font-semibold text-accent"
      >
        {name.trim().charAt(0).toUpperCase() || "?"}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- icone di siti esterni, dimensioni minime
    <img
      src={src}
      alt=""
      style={box}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setBroken(true)}
      className="shrink-0 rounded-md bg-surface object-contain ring-1 ring-line"
    />
  );
}

// Link che apre il sito in una nuova scheda, con l'icona della freccia.
export function ExternalLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      aria-label={label}
      title={label}
      className="relative z-10 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-accent-soft hover:text-accent"
    >
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
        <path d="M6.5 3.5H3.5v9h9v-3M9 2.5h4.5V7M13.5 2.5 7.5 8.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </a>
  );
}
