import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prevent Vercel/Turbopack from bundling these packages into serverless
  // functions — they're loaded via require() at runtime and rely on native
  // Node.js behavior for env var resolution and network I/O.
  serverExternalPackages: [
    "playwright",
    "@libsql/client",
    "@prisma/adapter-libsql",
  ],

  // Allow large screenshot and image upload payloads through server actions.
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
