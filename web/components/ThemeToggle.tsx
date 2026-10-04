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
      className="rounded-md border border-line px-3 py-1.5 text-sm text-ink-2 hover:bg-surface-2"
      aria-label={`Tema: ${LABELS[theme]}. Cambia tema`}
    >
      Tema: {LABELS[theme]}
    </button>
  );
}

// Applica il tema salvato prima che la pagina venga disegnata (niente lampo bianco).
export const themeScript = `try{var t=localStorage.getItem("polso-theme");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}`;
