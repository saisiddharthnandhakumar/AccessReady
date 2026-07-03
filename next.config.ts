import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prevent Vercel from bundling Playwright into serverless functions.
  // The browser is launched remotely via Browserless.io in production,
  // or locally via `playwright install chromium` in development.
  serverExternalPackages: ["playwright"],

  // Allow large screenshot and image upload payloads through server actions.
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
