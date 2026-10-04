import type { Metadata } from "next";
import Link from "next/link";

import { Logo } from "@/components/Logo";
import { ThemeToggle, themeScript } from "@/components/ThemeToggle";

import "./globals.css";

export const metadata: Metadata = {
  title: "Polso · lo stato dei siti",
  description: "Stato, uptime, tempi di risposta e certificati dei siti di K Digital Solution, controllati ogni ora.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen">
        <header className="bg-surface">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
            <Link href="/" className="flex items-center gap-2.5" aria-label="Polso, panoramica">
              <Logo size={22} />
              <span className="font-display text-xl font-semibold tracking-tight">polso</span>
            </Link>
            <ThemeToggle />
          </div>
          <div className="brand-rule" />
        </header>
        <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">{children}</main>
        <footer className="mx-auto max-w-6xl px-4 pb-12 text-xs leading-relaxed text-muted sm:px-6">
          Ogni sito viene controllato una volta all&apos;ora: le percentuali hanno questa risoluzione. Orari nel fuso
          di Roma.{" "}
          <a href="https://github.com/sofianekhatib30-ui/polso" className="underline decoration-line underline-offset-2 hover:text-ink">
            Codice su GitHub
          </a>
        </footer>
      </body>
    </html>
  );
}
