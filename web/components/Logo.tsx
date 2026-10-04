// Logo di Polso: un battito disegnato con i cinque colori della palette.
// È l'unico punto dove il gradiente compare per intero.

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size * 1.6} height={size} viewBox="0 0 48 30" aria-hidden="true">
      <defs>
        <linearGradient id="polso-battito" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#43BCCD" />
          <stop offset="0.35" stopColor="#662E9B" />
          <stop offset="0.62" stopColor="#EA3546" />
          <stop offset="0.8" stopColor="#F86624" />
          <stop offset="1" stopColor="#F9C80E" />
        </linearGradient>
      </defs>
      <path
        d="M2 17h9l3.5-9 5.5 18 5-14 3 5h18"
        fill="none"
        stroke="url(#polso-battito)"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
