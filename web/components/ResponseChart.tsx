"use client";

// Grafico dei tempi di risposta, ora per ora, disegnato a mano in SVG (nessuna libreria).
// - una sola linea: tempo medio dell'ora
// - le ore senza controlli restano un buco nella linea
// - le ore con disservizio sono segnate in basso in rosso, con una legenda testuale
// - passando sopra col mouse (o col dito) compare il dettaglio dell'ora

import { useEffect, useMemo, useRef, useState } from "react";

import type { SeriesPoint } from "@/lib/api";
import { dayLabel, hourLabel, ms, percent } from "@/lib/format";

const HEIGHT = 240;
const PAD = { top: 12, right: 12, bottom: 44, left: 56 };

function niceMax(v: number): number {
  if (v <= 0) return 100;
  const step = 10 ** Math.floor(Math.log10(v));
  return Math.ceil(v / step) * step;
}

export function ResponseChart({ points }: { points: SeriesPoint[] }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const [hover, setHover] = useState<number | null>(null);

  // la larghezza segue il contenitore, così il testo resta leggibile anche su telefono
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(320, Math.round(entry.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const geo = useMemo(() => {
    const innerW = width - PAD.left - PAD.right;
    const innerH = HEIGHT - PAD.top - PAD.bottom;
    const max = niceMax(Math.max(0, ...points.map((p) => p.avg_ms ?? 0)));
    const step = points.length > 1 ? innerW / (points.length - 1) : innerW;
    const x = (i: number) => PAD.left + i * step;
    const y = (v: number) => PAD.top + innerH - (v / max) * innerH;

    // spezza la linea dove mancano i dati
    const segments: string[] = [];
    let current = "";
    points.forEach((p, i) => {
      if (p.avg_ms === null) {
        if (current) segments.push(current);
        current = "";
      } else {
        current += `${current ? "L" : "M"}${x(i).toFixed(1)},${y(p.avg_ms).toFixed(1)}`;
      }
    });
    if (current) segments.push(current);

    const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(max * f));
    const labelEvery = width < 520 ? 24 : 12;
    return { innerW, innerH, max, step, x, y, segments, ticks, labelEvery };
  }, [points, width]);

  const downHours = points.filter((p) => p.uptime !== null && p.uptime < 100).length;
  const p = hover !== null ? points[hover] : null;
  const valid = points.filter((q) => q.avg_ms !== null);
  const summary = valid.length
    ? `Tempo medio di risposta nelle ultime ${points.length} ore: da ${Math.min(...valid.map((q) => q.avg_ms!))} a ${Math.max(...valid.map((q) => q.avg_ms!))} ms. ${downHours} ore con disservizio.`
    : "Nessun controllo nel periodo.";

  return (
    <div>
      <div ref={wrap} className="relative" onMouseLeave={() => setHover(null)}>
        <svg width={width} height={HEIGHT} role="img" aria-label={summary} className="block">
          {/* griglia orizzontale, discreta */}
          {geo.ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={width - PAD.right} y1={geo.y(t)} y2={geo.y(t)} stroke="var(--line)" />
              <text x={PAD.left - 8} y={geo.y(t)} dy="0.32em" textAnchor="end" fontSize="11" fill="var(--muted)">
                {t} ms
              </text>
            </g>
          ))}

          {/* etichette dell'asse del tempo */}
          {points.map((q, i) =>
            i % geo.labelEvery === 0 ? (
              <text key={q.hour} x={geo.x(i)} y={HEIGHT - PAD.bottom + 18} textAnchor="middle" fontSize="11" fill="var(--muted)">
                {hourLabel(q.hour) === "00:00" ? dayLabel(q.hour) : hourLabel(q.hour)}
              </text>
            ) : null,
          )}

          {/* ore con disservizio: tacche rosse sotto la linea di base */}
          {points.map((q, i) =>
            q.uptime !== null && q.uptime < 100 ? (
              <rect key={`down-${q.hour}`} x={geo.x(i) - 2} y={HEIGHT - PAD.bottom + 2} width={4} height={6} rx={1} fill="var(--bad)" />
            ) : null,
          )}

          {geo.segments.map((d) => (
            <path key={d} d={d} fill="none" stroke="var(--series)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          ))}

          {/* mirino + punto dell'ora selezionata */}
          {p && hover !== null && (
            <g pointerEvents="none">
              <line x1={geo.x(hover)} x2={geo.x(hover)} y1={PAD.top} y2={HEIGHT - PAD.bottom} stroke="var(--muted)" strokeDasharray="3 3" />
              {p.avg_ms !== null && (
                <circle cx={geo.x(hover)} cy={geo.y(p.avg_ms)} r={4.5} fill="var(--series)" stroke="var(--surface)" strokeWidth={2} />
              )}
            </g>
          )}

          {/* zone invisibili più larghe della linea: facili da colpire col mouse o col dito */}
          {points.map((q, i) => (
            <rect
              key={`hit-${q.hour}`}
              x={geo.x(i) - geo.step / 2}
              y={PAD.top}
              width={Math.max(geo.step, 6)}
              height={geo.innerH}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
              onTouchStart={() => setHover(i)}
            />
          ))}
        </svg>

        {p && hover !== null && (
          <div
            className="pointer-events-none absolute top-2 z-10 rounded-md border border-line bg-surface px-3 py-2 text-xs shadow-sm"
            style={{ left: Math.min(Math.max(geo.x(hover) - 80, 0), width - 170), width: 160 }}
          >
            <div className="font-medium text-ink">
              {dayLabel(p.hour)} · {hourLabel(p.hour)}
            </div>
            <div className="tabular mt-1 text-ink-2">Tempo medio: {ms(p.avg_ms)}</div>
            <div className="tabular text-ink-2">Controlli: {p.checks}</div>
            <div className="tabular text-ink-2">Uptime: {percent(p.uptime)}</div>
          </div>
        )}
      </div>

      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink-2">
        <span>Linea: tempo medio di risposta per ora</span>
        {downHours > 0 && (
          <span className="text-bad-ink">▲ Tacche rosse: {downHours} {downHours === 1 ? "ora" : "ore"} con disservizio</span>
        )}
      </div>

      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-ink-2">Vedi i dati in tabella</summary>
        <div className="mt-2 max-h-72 overflow-auto rounded border border-line">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-surface-2 text-left text-ink-2">
              <tr>
                <th className="px-3 py-1.5 font-normal">Ora</th>
                <th className="px-3 py-1.5 text-right font-normal">Tempo medio</th>
                <th className="px-3 py-1.5 text-right font-normal">Controlli</th>
                <th className="px-3 py-1.5 text-right font-normal">Uptime</th>
              </tr>
            </thead>
            <tbody>
              {[...points].reverse().map((q) => (
                <tr key={q.hour} className="border-t border-line">
                  <td className="px-3 py-1">
                    {dayLabel(q.hour)} {hourLabel(q.hour)}
                  </td>
                  <td className="tabular px-3 py-1 text-right">{ms(q.avg_ms)}</td>
                  <td className="tabular px-3 py-1 text-right">{q.checks}</td>
                  <td className="tabular px-3 py-1 text-right">{percent(q.uptime)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
