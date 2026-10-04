"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Panoramica", match: (p: string) => p === "/" || p.startsWith("/sites") },
  { href: "/stato", label: "Clienti", match: (p: string) => p.startsWith("/stato") },
  { href: "/report", label: "Report", match: (p: string) => p.startsWith("/report") },
];

export function Nav() {
  const path = usePathname();
  return (
    <nav aria-label="Sezioni" className="flex items-center gap-0.5 text-sm sm:gap-1">
      {LINKS.map((l) => {
        const active = l.match(path);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-full px-2.5 py-1.5 transition-colors sm:px-3 ${active ? "bg-accent-soft font-medium text-accent" : "text-ink-2 hover:text-ink"}`}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
