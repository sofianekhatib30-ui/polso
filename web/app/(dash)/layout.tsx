import Link from "next/link";

import { CommandPalette, type PaletteItem } from "@/components/CommandPalette";
import { Logo } from "@/components/Logo";
import { Nav } from "@/components/Nav";
import { statusOf } from "@/components/Status";
import { ThemeToggle } from "@/components/ThemeToggle";
import { api } from "@/lib/api";
import { host } from "@/lib/format";

// Elementi della ricerca rapida. Se l'API non risponde, la ricerca offre solo le pagine:
// il resto del sito deve funzionare lo stesso.
async function paletteItems(): Promise<PaletteItem[]> {
  const pages: PaletteItem[] = [
    {
      href: "/",
      title: "Panoramica",
      detail: "Stato di tutti i siti",
      group: "Pagine",
    },
    {
      href: "/stato",
      title: "Clienti",
      detail: "Pagine di stato da condividere",
      group: "Pagine",
    },
    {
      href: "/report",
      title: "Report mensile",
      detail: "Uptime e disservizi del mese, da stampare",
      group: "Pagine",
    },
  ];
  try {
    const [sites, clients] = await Promise.all([api.sites(), api.clients()]);
    return [
      ...pages,
      ...sites.map((s) => ({
        href: `/sites/${s.id}`,
        title: s.name,
        detail: [host(s.url), s.client_name].filter(Boolean).join(", "),
        group: "Siti" as const,
        kind: statusOf(s),
        icon: s.icon_url,
      })),
      ...clients.map((c) => ({
        href: `/stato/${c.slug}`,
        title: c.name,
        detail: `Pagina di stato, ${c.sites} ${c.sites === 1 ? "sito" : "siti"}`,
        group: "Clienti" as const,
      })),
    ];
  } catch {
    return pages;
  }
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const items = await paletteItems();
  return (
    <>
      <header className="bg-surface print:hidden">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 py-3 sm:gap-3 sm:px-6">
          <div className="flex items-center gap-2 sm:gap-8">
            <Link
              href="/"
              className="flex items-center gap-2.5"
              aria-label="Polso, panoramica"
            >
              <Logo size={22} />
              <span className="hidden font-display text-xl font-semibold tracking-tight sm:inline">
                polso
              </span>
            </Link>
            <Nav />
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <CommandPalette items={items} />
            <ThemeToggle />
          </div>
        </div>
        <div className="brand-rule" />
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12 print:max-w-none print:p-0">
        {children}
      </main>
      <footer className="mx-auto max-w-6xl px-4 pb-12 text-xs leading-relaxed text-muted sm:px-6 print:hidden">
        Ogni sito viene controllato ogni 15 minuti: le percentuali hanno questa
        risoluzione. Orari nel fuso di Roma.{" "}
        <a
          href="https://github.com/sofianekhatib30-ui/polso"
          className="underline decoration-line underline-offset-2 hover:text-ink"
        >
          Codice su GitHub
        </a>
      </footer>
    </>
  );
}
