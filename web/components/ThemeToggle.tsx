"use client";

import { useSyncExternalStore } from "react";

type Theme = "light" | "dark" | "system";
const LABELS: Record<Theme, string> = { system: "Automatico", light: "Chiaro", dark: "Scuro" };
const NEXT: Record<Theme, Theme> = { system: "light", light: "dark", dark: "system" };

function read(): Theme {
  try {
    const t = localStorage.getItem("polso-theme");
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
}

// Piccolo "negozio" del tema: React lo rilegge quando cambia (anche da un'altra scheda).
const listeners = new Set<() => void>();
function subscribe(fn: () => void) {
  listeners.add(fn);
  window.addEventListener("storage", fn);
  return () => {
    listeners.delete(fn);
    window.removeEventListener("storage", fn);
  };
}

export function ThemeToggle() {
  // sul server il tema è sempre "system"; nel browser si legge quello salvato
  const theme = useSyncExternalStore(subscribe, read, () => "system" as Theme);

  function cycle() {
    const next = NEXT[theme];
    if (next === "system") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", next);
    try {
      if (next === "system") localStorage.removeItem("polso-theme");
      else localStorage.setItem("polso-theme", next);
    } catch {
      /* in navigazione privata il tema non viene ricordato: va bene così */
    }
    listeners.forEach((fn) => fn());
  }

  return (
    <button
      type="button"
      onClick={cycle}
      className="inline-flex h-9 items-center gap-2 rounded-full border border-line px-3 text-sm text-ink-2 transition-colors hover:border-accent hover:text-ink"
      aria-label={`Tema: ${LABELS[theme]}. Cambia tema`}
      title={`Tema: ${LABELS[theme]}`}
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
  if (theme === "dark") {
    return (
      <svg {...p} strokeLinejoin="round">
        <path d="M13.5 9.6A5.8 5.8 0 0 1 6.4 2.5a5.8 5.8 0 1 0 7.1 7.1Z" />
      </svg>
    );
  }
  return (
    <svg {...p}>
      <circle cx="8" cy="8" r="6" />
      <path d="M8 2a6 6 0 0 1 0 12Z" fill="currentColor" stroke="none" />
    </svg>
  );
}

// Applica il tema salvato prima che la pagina venga disegnata (niente lampo bianco).
export const themeScript = `try{var t=localStorage.getItem("polso-theme");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}`;
