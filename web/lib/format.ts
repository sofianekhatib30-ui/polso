// Formattazione in italiano, fuso orario di Roma.

const TZ = "Europe/Rome";

export function dateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("it-IT", {
    timeZone: TZ,
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function hourLabel(iso: string): string {
  return new Intl.DateTimeFormat("it-IT", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

export function dayLabel(iso: string): string {
  return new Intl.DateTimeFormat("it-IT", { timeZone: TZ, weekday: "short", day: "numeric" }).format(new Date(iso));
}

export function timeAgo(iso: string | null, now = Date.now()): string {
  if (!iso) return "mai";
  const min = Math.round((now - new Date(iso).getTime()) / 60000);
  if (min < 1) return "adesso";
  if (min < 60) return `${min} min fa`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h} h fa`;
  return `${Math.round(h / 24)} giorni fa`;
}

export function percent(v: number | null): string {
  if (v === null) return "—";
  // 99,95 % e non 100 %: arrotondare per eccesso nasconderebbe i disservizi
  return `${(Math.floor(v * 100) / 100).toLocaleString("it-IT", { maximumFractionDigits: 2 })} %`;
}

export function ms(v: number | null): string {
  return v === null ? "—" : `${v.toLocaleString("it-IT")} ms`;
}

export function duration(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export function host(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export function dayLong(isoDay: string): string {
  // "2026-10-04" è una data di calendario: la leggiamo a mezzogiorno per non cambiare giorno col fuso
  return new Intl.DateTimeFormat("it-IT", { weekday: "short", day: "numeric", month: "long" }).format(
    new Date(`${isoDay}T12:00:00`),
  );
}

export function dayShort(isoDay: string): string {
  return new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short" }).format(new Date(`${isoDay}T12:00:00`));
}
