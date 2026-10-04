import type { Metadata } from "next";
import Link from "next/link";

import { ThemeToggle, themeScript } from "@/components/ThemeToggle";

import "./globals.css";

export const metadata: Metadata = {
  title: "Polso · monitor dei siti",
  description: "Stato, uptime, tempi di risposta e certificati SSL dei siti monitorati.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen">
        <header className="border-b border-line bg-surface">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
            <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
              <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M2 12h4l2.5-6 4 12 3-9 2 3H22"
                  fill="none"
                  stroke="var(--series)"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Polso
            </Link>
            <ThemeToggle />
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
        <footer className="mx-auto max-w-6xl px-4 pb-10 text-xs text-muted">
          Controlli ogni ora · orari nel fuso di Roma · dati aggiornati al massimo ogni minuto
        </footer>
      </body>
    </html>
  );
}
