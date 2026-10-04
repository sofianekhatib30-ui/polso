import Link from "next/link";

import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";

// Pagine pubbliche per i clienti: nessun menu della dashboard, solo il contenuto e chi lo firma.
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="brand-rule" />
      <div className="px-4 sm:px-6">
        <div className="mx-auto max-w-3xl">
          <div className="flex justify-end pt-4">
            <ThemeToggle />
          </div>
          <main className="pt-6 pb-12 sm:pt-10">{children}</main>
          <footer className="flex items-center gap-2 pb-12 text-xs text-muted">
            <Logo size={14} />
            <span>
              Monitorato con{" "}
              <Link href="/" className="underline decoration-line underline-offset-2 hover:text-ink">
                polso
              </Link>
            </span>
          </footer>
        </div>
      </div>
    </>
  );
}
