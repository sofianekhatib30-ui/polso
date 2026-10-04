import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // build "standalone": l'immagine Docker contiene solo il necessario per avviare il sito
  output: "standalone",
};

export default nextConfig;
