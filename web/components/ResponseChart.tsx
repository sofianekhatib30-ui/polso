"use client";

// Grafico dei tempi di risposta, ora per ora, disegnato a mano in SVG (nessuna libreria).
// - linea viola: tempo medio dell'ora (il viola è il colore del marchio, non uno stato)
// - le ore senza controlli restano un buco nella linea: niente dati inventati
// - fasce rosse tenui: gli incidenti, dall'inizio alla risoluzione
// - tacche rosse sotto l'asse: le ore con almeno un controllo fallito
// - passando sopra col mouse (o col dito) compare il dettaglio dell'ora

import { useEffect, useMemo, useRef, useState } from "react";

import type { Incident, SeriesPoint } from "@/lib/api";
import { dayLabel, hourLabel, ms, percent } from "@/lib/format";

const HEIGHT = 260;
const PAD = { top: 14, right: 8, bottom: 40, left: 58 };
const HOUR = 3_600_000;

function niceMax(v: number): number {
  if (v <= 0) return 100;
  const step = 10 ** Math.floor(Math.log10(v));
  const m = v / step;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * step;
}

function labelEvery(hours: number, width: number): number {
  const wanted = Math.max(3, Math.floor(width / 110));
  return [3, 6, 12, 24, 48, 72, 120, 168].find((h) => hours / h <= wanted) ?? 168;
}

export function ResponseChart({ points, incidents = [] }: { points: SeriesPoint[]; incidents?: Incident[] }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const [hover, setHover] = useState<number | null>(null);

  // la larghezza segue il contenitore, così il testo resta leggibile anche su telefono
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(300, Math.round(entry.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const geo = useMemo(() => {
    const innerW = width - PAD.left - PAD.right;
    const innerH = HEIGHT - PAD.top - PAD.bottom;
    const base = PAD.top + innerH;
    const max = niceMax(Math.max(0, ...points.map((p) => p.avg_ms ?? 0)));
    const step = points.length > 1 ? innerW / (points.length - 1) : innerW;
    const x = (i: number) => PAD.left + i * step;
    const y = (v: number) => base - (v / max) * innerH;
    const t0 = points.length ? new Date(points[0].hour).getTime() : 0;
    // un incidente ancora aperto arriva fino alla fine del grafico
    const tEnd = points.length ? new Date(points[points.length - 1].hour).getTime() + HOUR : 0;
    const xAt = (iso: string | null) => {
      const t = iso ? new Date(iso).getTime() : tEnd;
      return Math.min(Math.max(x((t - t0) / HOUR), PAD.left), PAD.left + innerW);
    };

    // spezza la linea dove mancano i dati; ogni pezzo ha anche la sua area sfumata
    const lines: string[] = [];
    const areas: string[] = [];
    let run: [number, number][] = [];
    const flush = () => {
      if (run.length) {
        const d = run.map(([px, py], k) => `${k ? "L" : "M"}${px.toFixed(1)},${py.toFixed(1)}`).join("");
        lines.push(d);
        areas.push(`${d}L${run[run.length - 1][0].toFixed(1)},${base}L${run[0][0].toFixed(1)},${base}Z`);
      }
      run = [];
    };
    points.forEach((p, i) => (p.avg_ms === null ? flush() : run.push([x(i), y(p.avg_ms)])));
    flush();

    const bands = incidents
      .map((inc) => ({ id: inc.id, x1: xAt(inc.started_at), x2: xAt(inc.resolved_at), open: !inc.resolved_at }))
      .filter((b) => b.x2 > PAD.left && b.x1 < PAD.left + innerW)
      .map((b) => ({ ...b, w: Math.max(b.x2 - b.x1, 3) }));

    const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(max * f));

    // etichette del tempo sulle ore "tonde" di Roma; oltre le 24 ore, una mezzanotte ogni N
    const every = labelEvery(points.length, width);
    const labels: { i: number; text: string }[] = [];
    let midnights = 0;
    points.forEach((q, i) => {
      const h = Number(hourLabel(q.hour).slice(0, 2)) % 24;
      const show = every >= 24 ? h === 0 && midnights++ % (every / 24) === 0 : h % every === 0;
      const px = x(i);
      if (show && px > PAD.left + 16 && px < width - PAD.right - 16) {
        labels.push({ i, text: h === 0 ? dayLabel(q.hour) : hourLabel(q.hour) });
      }
    });
    return { innerW, innerH, base, max, step, x, y, lines, areas, bands, ticks, labels };
  }, [points, incidents, width]);

  const downHours = points.filter((p) => p.uptime !== null && p.uptime < 100).length;
  const p = hover !== null ? points[hover] : null;
  const valid = points.filter((q) => q.avg_ms !== null).map((q) => q.avg_ms!);
  const summary = valid.length
    ? `Tempo medio di risposta nelle ultime ${points.length} ore: da ${Math.min(...valid)} a ${Math.max(...valid)} ms. ` +
      `${downHours} ore con controlli falliti, ${geo.bands.length} incidenti nel periodo.`
    : "Nessun controllo nel periodo.";

  if (!valid.length) {
    return <p className="py-10 text-center text-ink-2">Nessun controllo in questo periodo.</p>;
  }

  return (
    <div>
      <div ref={wrap} className="relative" onMouseLeave={() => setHover(null)}>
        <svg width={width} height={HEIGHT} role="img" aria-label={summary} className="block">
          <defs>
            <linearGradient id="polso-area" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="var(--accent)" stopOpacity="0.22" />
              <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* incidenti: fasce dall'inizio alla risoluzione */}
          {geo.bands.map((b) => (
            <g key={`inc-${b.id}`}>
              <rect x={b.x1} y={PAD.top} width={b.w} height={geo.innerH} fill="var(--down)" fillOpacity={0.1} />
              <line x1={b.x1} x2={b.x1} y1={PAD.top} y2={geo.base} stroke="var(--down)" strokeOpacity={0.5} strokeDasharray="2 3" />
            </g>
          ))}

          {/* griglia orizzontale, discreta */}
          {geo.ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={width - PAD.right} y1={geo.y(t)} y2={geo.y(t)} stroke="var(--line)" />
              <text x={PAD.left - 10} y={geo.y(t)} dy="0.32em" textAnchor="end" fontSize="11" fill="var(--muted)" className="tabular">
                {t.toLocaleString("it-IT")} ms
              </text>
            </g>
          ))}

          {/* etichette dell'asse del tempo */}
          {geo.labels.map((l) => (
            <text key={l.i} x={geo.x(l.i)} y={geo.base + 26} textAnchor="middle" fontSize="11" fill="var(--muted)">
              {l.text}
            </text>
          ))}

          {/* ore con controlli falliti: tacche rosse sotto l'asse */}
          {points.map((q, i) =>
            q.uptime !== null && q.uptime < 100 ? (
              <rect key={`down-${q.hour}`} x={geo.x(i) - 1.5} y={geo.base + 4} width={3} height={7} rx={1} fill="var(--down)" />
            ) : null,
          )}

          {geo.areas.map((d) => (
            <path key={`a-${d}`} d={d} fill="url(#polso-area)" />
          ))}
          {geo.lines.map((d) => (
            <path key={d} d={d} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          ))}

          {/* mirino + punto dell'ora selezionata */}
          {p && hover !== null && (
            <g pointerEvents="none">
              <line x1={geo.x(hover)} x2={geo.x(hover)} y1={PAD.top} y2={geo.base} stroke="var(--ink-2)" strokeOpacity={0.5} />
              {p.avg_ms !== null && (
                <circle cx={geo.x(hover)} cy={geo.y(p.avg_ms)} r={5} fill="var(--accent)" stroke="var(--surface)" strokeWidth={2.5} />
              )}
            </g>
          )}

          {/* zone invisibili più larghe della linea: facili da colpire col mouse o col dito */}
          {points.map((q, i) => (
            <rect
              key={`hit-${q.hour}`}
              x={geo.x(i) - geo.step / 2}
              y={PAD.top}
              width={Math.max(geo.step, 1)}
              height={geo.innerH + 14}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
              onTouchStart={() => setHover(i)}
            />
          ))}
        </svg>

        {p && hover !== null && (
          <div
            className="pointer-events-none absolute top-1 z-10 w-44 rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-lg"
            style={{ left: Math.min(Math.max(geo.x(hover) - 88, 0), width - 180) }}
          >
            <div className="font-medium text-ink">
              {dayLabel(p.hour)}, {hourLabel(p.hour)}
            </div>
            <div className="tabular mt-1 flex justify-between text-ink-2">
              <span>Tempo medio</span>
              <span className="text-ink">{ms(p.avg_ms)}</span>
            </div>
            <div className="tabular flex justify-between text-ink-2">
              <span>Controlli ok</span>
              <span className={p.uptime !== null && p.uptime < 100 ? "font-medium text-down-ink" : "text-ink"}>
                {p.checks ? percent(p.uptime) : "nessuno"}
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1.5 text-xs text-ink-2">
        <span className="inline-flex items-center gap-2">
          <span className="h-0.5 w-4 rounded bg-accent" /> Tempo medio per ora
        </span>
        {geo.bands.length > 0 && (
          <span className="inline-flex items-center gap-2">
            <span className="h-3 w-4 border-l border-dashed border-down bg-down/10" /> Incidente ({geo.bands.length})
          </span>
        )}
        {downHours > 0 && (
          <span className="inline-flex items-center gap-2">
            <span className="h-2 w-[3px] rounded-[1px] bg-down" /> Ora con controlli falliti ({downHours})
          </span>
        )}
      </div>

      <details className="mt-4 text-sm">
        <summary className="cursor-pointer text-ink-2 hover:text-ink">Vedi i dati in tabella</summary>
        <div className="mt-2 max-h-72 overflow-auto rounded-lg border border-line">
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
