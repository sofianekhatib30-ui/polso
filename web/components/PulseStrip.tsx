"use client";

// La "striscia del polso": un segmento per giorno.
//   pieno azzurro    tutti i controlli del giorno andati bene
//   basso arancio    qualche controllo fallito (altezza ridotta: si distingue dal rosso anche senza colori)
//   pieno rosso      più di un quarto dei controlli fallito
//   tratteggio grigio nessun controllo: non è "online", è "non misurato"

import { useState } from "react";

import type { DayPoint } from "@/lib/api";
import { dayLong, percent } from "@/lib/format";

type Kind = "ok" | "partial" | "down" | "nodata";

function kindOf(d: DayPoint): Kind {
  if (d.checks === 0 || d.uptime === null) return "nodata";
  if (d.uptime >= 100) return "ok";
  if (d.uptime >= 75) return "partial";
  return "down";
}

const STYLE: Record<Kind, React.CSSProperties> = {
  ok: { background: "var(--ok)", height: "100%" },
  partial: { background: "var(--partial)", height: "62%" },
  down: { background: "var(--down)", height: "100%" },
  nodata: {
    height: "100%",
    background: "repeating-linear-gradient(135deg, var(--nodata) 0 2px, transparent 2px 4px)",
  },
};

const WORD: Record<Kind, string> = {
  ok: "tutto online",
  partial: "disservizio parziale",
  down: "giù per gran parte del giorno",
  nodata: "nessun controllo",
};

export function PulseStrip({ days, height = 28 }: { days: DayPoint[]; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const counts = days.reduce<Record<Kind, number>>(
    (acc, d) => ({ ...acc, [kindOf(d)]: acc[kindOf(d)] + 1 }),
    { ok: 0, partial: 0, down: 0, nodata: 0 },
  );
  const summary =
    `Ultimi ${days.length} giorni: ${counts.ok} tutto online, ${counts.partial} con disservizi parziali, ` +
    `${counts.down} giù, ${counts.nodata} senza controlli.`;
  const d = hover !== null ? days[hover] : null;

  return (
    <div className="relative" onMouseLeave={() => setHover(null)}>
      <div role="img" aria-label={summary} className="flex items-end gap-[2px]" style={{ height }}>
        {days.map((day, i) => (
          <div
            key={day.day}
            className="flex h-full min-w-[2px] flex-1 items-end"
            onMouseEnter={() => setHover(i)}
            onTouchStart={() => setHover(i)}
          >
            <div
              className="w-full rounded-[2px] transition-opacity"
              style={{ ...STYLE[kindOf(day)], opacity: hover === null || hover === i ? 1 : 0.55 }}
            />
          </div>
        ))}
      </div>
      {d && hover !== null && (
        <div
          className="pointer-events-none absolute bottom-full z-20 mb-2 w-max max-w-56 rounded-md border border-line bg-surface px-3 py-2 text-xs shadow-lg"
          style={{
            left: `${((hover + 0.5) / days.length) * 100}%`,
            transform: `translateX(${hover < days.length * 0.2 ? "-10%" : hover > days.length * 0.8 ? "-90%" : "-50%"})`,
          }}
        >
          <div className="font-medium text-ink">{dayLong(d.day)}</div>
          <div className="mt-0.5 text-ink-2">
            {d.checks === 0 ? WORD.nodata : `${percent(d.uptime)} · ${d.up} di ${d.checks} controlli ok`}
          </div>
          {d.checks > 0 && kindOf(d) !== "ok" && <div className="text-ink-2">{WORD[kindOf(d)]}</div>}
        </div>
      )}
    </div>
  );
}

export function PulseLegend() {
  const items: [Kind, string][] = [
    ["ok", "Tutto online"],
    ["partial", "Disservizio parziale"],
    ["down", "Giù"],
    ["nodata", "Nessun controllo"],
  ];
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink-2">
      {items.map(([k, label]) => (
        <li key={k} className="inline-flex items-center gap-1.5">
          <span className="flex h-3 w-2 items-end">
            <span className="block w-full rounded-[1px]" style={STYLE[k]} />
          </span>
          {label}
        </li>
      ))}
    </ul>
  );
}
