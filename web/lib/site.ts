// Indirizzo pubblico della dashboard: serve per i link da copiare (pagine di stato, badge).
export const SITE_URL = (process.env.POLSO_PUBLIC_URL ?? "https://polso-one.vercel.app").replace(/\/$/, "");

// Le pagine leggono l'ora al momento della richiesta: questi aiuti tengono i conti fuori dai componenti.
export function minutesSince(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 60000;
}

export function withinDays(iso: string, days: number): boolean {
  return minutesSince(iso) <= days * 1440;
}

// Gli ultimi n mesi come "AAAA-MM", dal più recente (per il menu del report).
export function lastMonths(n: number): string[] {
  // anno e mese di oggi a Roma (non in UTC: il 1° del mese a mezzanotte sarebbe ancora il mese prima)
  const [y, mo] = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit" })
    .format(new Date())
    .split("-")
    .map(Number);
  return Array.from({ length: n }, (_, i) => {
    const m = new Date(Date.UTC(y, mo - 1 - i, 1));
    return `${m.getUTCFullYear()}-${String(m.getUTCMonth() + 1).padStart(2, "0")}`;
  });
}

export function todayLong(): string {
  return new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", day: "numeric", month: "long", year: "numeric" }).format(
    new Date(),
  );
}
