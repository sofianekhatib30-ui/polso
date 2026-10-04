import type { Metadata } from "next";
import Link from "next/link";

import { ApiDown, SectionHead } from "@/components/Blocks";
import { CopyButton } from "@/components/Buttons";
import { api, ApiError, type Client } from "@/lib/api";
import { percent } from "@/lib/format";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Clienti · Polso" };

export default async function ClientsPage() {
  let clients: Client[];
  try {
    clients = await api.clients();
  } catch (e) {
    return <ApiDown message={e instanceof ApiError ? e.message : "Errore sconosciuto"} />;
  }

  return (
    <div className="space-y-12">
      <section className="max-w-3xl">
        <h1 className="font-display text-4xl leading-[1.05] font-semibold tracking-tight sm:text-5xl">
          Una pagina di stato per ogni cliente.
        </h1>
        <p className="mt-4 text-lg text-ink-2">
          Mostra solo i siti di quel cliente, in parole semplici e senza numeri tecnici. Si manda con un link: chi la
          apre vede se il sito funziona e cosa è successo negli ultimi giorni.
        </p>
      </section>

      <section>
        <SectionHead title="Clienti" />
        {clients.length === 0 ? (
          <p className="text-ink-2">
            Nessun cliente ancora. Nel file dei siti aggiungi <code className="text-ink">| cliente=Nome</code> dopo il
            nome del sito: il cliente compare qui al controllo successivo.
          </p>
        ) : (
          <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
            {clients.map((c) => {
              const link = `${SITE_URL}/stato/${c.slug}`;
              return (
                <li key={c.slug} className="flex flex-wrap items-center gap-x-6 gap-y-3 px-5 py-4">
                  <div className="min-w-0 flex-1">
                    <Link href={`/stato/${c.slug}`} className="font-medium text-ink hover:text-accent">
                      {c.name}
                    </Link>
                    <div className="text-sm text-muted">
                      {c.sites} {c.sites === 1 ? "sito" : "siti"}, uptime 30 giorni{" "}
                      <span className="tabular text-ink-2">{percent(c.uptime_30d)}</span>
                    </div>
                  </div>
                  <Link href={`/report?cliente=${c.slug}`} className="text-sm text-ink-2 hover:text-accent">
                    Report del mese
                  </Link>
                  <CopyButton text={link} label="Copia il link" />
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
