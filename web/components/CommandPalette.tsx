"use client";

// Ricerca rapida: ⌘K (Mac) o Ctrl+K, oppure "/" quando non si sta scrivendo.
// Si cerca per nome del sito, indirizzo o cliente; frecce per muoversi, Invio per aprire, Esc per chiudere.

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { StatusShape, type StatusKind } from "./Status";

export type PaletteItem = {
  href: string;
  title: string;
  detail?: string;
  group: "Pagine" | "Siti" | "Clienti";
  kind?: StatusKind;
};

// "Città" e "citta" devono trovarsi a vicenda
const fold = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

export function CommandPalette({ items }: { items: PaletteItem[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const opener = useRef<HTMLElement | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const typing = e.target instanceof HTMLElement && e.target.closest("input, textarea, select, [contenteditable]");
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        opener.current = document.activeElement as HTMLElement | null;
        setOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) input.current?.focus();
    else opener.current?.focus?.();
  }, [open]);

  const results = useMemo(() => {
    const q = fold(query.trim());
    const found = q
      ? items.filter((i) => fold(`${i.title} ${i.detail ?? ""}`).includes(q))
      : items.filter((i) => i.group !== "Siti" || i.kind === "down" || i.kind === "partial").concat(
          items.filter((i) => i.group === "Siti" && i.kind !== "down" && i.kind !== "partial"),
        );
    return found.slice(0, 12);
  }, [items, query]);

  function close() {
    setOpen(false);
    setQuery("");
    setActive(0);
  }

  function go(item: PaletteItem | undefined) {
    if (!item) return;
    close();
    router.push(item.href);
  }

  function onInputKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(results[active]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          opener.current = e.currentTarget;
          setOpen(true);
        }}
        className="inline-flex h-9 items-center gap-2 rounded-full border border-line px-2.5 text-sm sm:px-3 text-ink-2 transition-colors hover:border-accent hover:text-ink"
        aria-label="Cerca un sito o una pagina"
        aria-keyshortcuts="Meta+K Control+K"
      >
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
          <circle cx="7" cy="7" r="4.75" />
          <path d="m10.5 10.5 3.5 3.5" strokeLinecap="round" />
        </svg>
        <span className="hidden sm:inline">Cerca</span>
        <kbd className="hidden rounded border border-line px-1.5 text-[11px] text-muted md:inline">⌘K</kbd>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh]" role="presentation">
          <div className="absolute inset-0 bg-ink/30 backdrop-blur-[2px]" onClick={close} aria-hidden="true" />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Ricerca rapida"
            className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl"
          >
            <div className="flex items-center gap-3 border-b border-line px-4">
              <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="var(--muted)" strokeWidth="1.6" aria-hidden="true">
                <circle cx="7" cy="7" r="4.75" />
                <path d="m10.5 10.5 3.5 3.5" strokeLinecap="round" />
              </svg>
              <input
                ref={input}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActive(0);
                }}
                onKeyDown={onInputKey}
                placeholder="Cerca un sito, un cliente o una pagina"
                className="h-14 w-full bg-transparent text-base text-ink outline-none placeholder:text-muted focus-visible:outline-none"
                role="combobox"
                aria-expanded="true"
                aria-controls="palette-risultati"
                aria-activedescendant={results[active] ? `palette-${active}` : undefined}
              />
              <kbd className="rounded border border-line px-1.5 text-[11px] text-muted">Esc</kbd>
            </div>
            <ul id="palette-risultati" role="listbox" className="max-h-[50vh] overflow-y-auto p-2">
              {results.length === 0 && <li className="px-3 py-6 text-center text-sm text-ink-2">Nessun risultato per “{query}”.</li>}
              {results.map((item, i) => (
                <li
                  key={item.href}
                  id={`palette-${i}`}
                  role="option"
                  aria-selected={i === active}
                  onMouseMove={() => setActive(i)}
                  onClick={() => go(item)}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 ${i === active ? "bg-accent-soft" : ""}`}
                >
                  <span className="flex w-4 justify-center">
                    {item.kind ? <StatusShape kind={item.kind} /> : <span className="h-1.5 w-1.5 rounded-full bg-accent" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">{item.title}</span>
                    {item.detail && <span className="block truncate text-xs text-muted">{item.detail}</span>}
                  </span>
                  <span className="text-xs text-muted">{item.group}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
