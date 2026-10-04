// Scheletro della panoramica mentre arrivano i dati dall'API.
export default function Loading() {
  return (
    <div className="space-y-14" aria-busy="true" aria-label="Caricamento dello stato dei siti">
      <div className="max-w-3xl space-y-4">
        <div className="skeleton h-4 w-64 rounded" />
        <div className="skeleton h-14 w-full rounded-lg" />
      </div>
      <div className="skeleton h-24 rounded-lg" />
      <div className="space-y-2 rounded-xl border border-line bg-surface p-5">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="skeleton h-10 rounded" />
        ))}
      </div>
    </div>
  );
}
