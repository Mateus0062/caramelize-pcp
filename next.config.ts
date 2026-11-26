import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    unoptimized: true,
  },
  // O PGlite (PostgreSQL embutido do modo local) carrega arquivos WASM em
  // tempo de execução e não deve ser empacotado pelo Next.
  serverExternalPackages: ["@electric-sql/pglite"],
  poweredByHeader: false,
};

export default nextConfig;
