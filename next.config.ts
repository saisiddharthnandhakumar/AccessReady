import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prevent Vercel/Turbopack from bundling these packages into serverless
  // functions — they're loaded via require() at runtime and rely on native
  // Node.js behavior for env var resolution and network I/O.
  serverExternalPackages: [
    "@libsql/client",
    "@prisma/adapter-libsql",
  ],

  // playwright-core loads browsers.json via fs.readFileSync, not require(),
  // so Vercel's Node File Trace doesn't detect the dependency and prunes it.
  // Tell the tracer to include it explicitly.
  outputFileTracingIncludes: {
    "/api/scans": ["./node_modules/playwright-core/browsers.json"],
    "/api/scans/[id]/preview": ["./node_modules/playwright-core/browsers.json"],
  },

  // Allow large screenshot and image upload payloads through server actions.
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
