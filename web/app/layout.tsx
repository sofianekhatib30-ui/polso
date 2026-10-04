import type { Metadata } from "next";

import { themeScript } from "@/components/ThemeToggle";

import "./globals.css";

export const metadata: Metadata = {
  title: "Polso · lo stato dei siti",
  description: "Stato, uptime, tempi di risposta, certificati e domini dei siti di K Digital Solution, controllati ogni 15 minuti.",
};

// Struttura comune a tutte le pagine. Intestazioni e piè di pagina stanno nei layout dei gruppi:
// (dash) per la dashboard, (pubblico) per le pagine di stato da mandare ai clienti.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
