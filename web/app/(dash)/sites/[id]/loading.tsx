// Scheletro della pagina di un sito mentre arrivano i dati dall'API.
export default function Loading() {
  return (
    <div className="space-y-14" aria-busy="true" aria-label="Caricamento del sito">
      <div className="space-y-4">
        <div className="skeleton h-4 w-24 rounded" />
        <div className="skeleton h-14 w-2/3 rounded-lg" />
      </div>
      <div className="skeleton h-11 rounded" />
      <div className="skeleton h-24 rounded-lg" />
      <div className="skeleton h-72 rounded-xl" />
    </div>
  );
}
