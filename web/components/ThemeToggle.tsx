"use client";

import { useSyncExternalStore } from "react";

type Theme = "light" | "dark";
const LABELS: Record<Theme, string> = { light: "Chiaro", dark: "Scuro" };

// Due soli temi. Alla prima visita si segue quello del dispositivo;
// se lo cambi col pulsante, la scelta viene ricordata.
const media = () => window.matchMedia("(prefers-color-scheme: dark)");

function read(): Theme {
  try {
    const t = localStorage.getItem("polso-theme");
    if (t === "light" || t === "dark") return t;
  } catch {
    /* in navigazione privata si segue il dispositivo */
  }
  return media().matches ? "dark" : "light";
}

// Piccolo "negozio" del tema: React lo rilegge quando cambia
// (dal pulsante, da un'altra scheda o dalle impostazioni del dispositivo).
const listeners = new Set<() => void>();
function subscribe(fn: () => void) {
  listeners.add(fn);
  window.addEventListener("storage", fn);
  media().addEventListener("change", fn);
  return () => {
    listeners.delete(fn);
    window.removeEventListener("storage", fn);
    media().removeEventListener("change", fn);
  };
}

export function ThemeToggle() {
  // sul server non si conosce il dispositivo: si parte dal chiaro e il browser corregge subito
  const theme = useSyncExternalStore(subscribe, read, () => "light" as Theme);
  const next: Theme = theme === "light" ? "dark" : "light";

  function toggle() {
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("polso-theme", next);
    } catch {
      /* in navigazione privata il tema non viene ricordato: va bene così */
    }
    listeners.forEach((fn) => fn());
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="inline-flex h-9 items-center gap-2 rounded-full border border-line px-2.5 text-sm sm:px-3 text-ink-2 transition-colors hover:border-accent hover:text-ink"
      aria-label={`Tema ${LABELS[theme].toLowerCase()}. Passa al tema ${LABELS[next].toLowerCase()}`}
      title={`Passa al tema ${LABELS[next].toLowerCase()}`}
    >
      <ThemeIcon theme={theme} />
      <span className="hidden sm:inline">{LABELS[theme]}</span>
    </button>
  );
}

function ThemeIcon({ theme }: { theme: Theme }) {
  const p = { width: 16, height: 16, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.5, "aria-hidden": true as const };
  if (theme === "light") {
    return (
      <svg {...p} strokeLinecap="round">
        <circle cx="8" cy="8" r="3" />
        <path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1 1M11.6 11.6l1 1M3.4 12.6l1-1M11.6 4.4l1-1" />
      </svg>
    );
  }
  return (
    <svg {...p} strokeLinejoin="round">
      <path d="M13.5 9.6A5.8 5.8 0 0 1 6.4 2.5a5.8 5.8 0 1 0 7.1 7.1Z" />
    </svg>
  );
}

// Applica il tema salvato prima che la pagina venga disegnata (niente lampo bianco).
export const themeScript = `try{var t=localStorage.getItem("polso-theme");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}`;
