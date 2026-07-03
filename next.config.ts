import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Trust the x-forwarded-* headers that ngrok (and other proxies) send.
  // Without this, Next.js may reject requests whose Host header differs
  // from localhost, and may generate incorrect redirect URLs.
  allowedDevOrigins: process.env.NGROK_URL ? [process.env.NGROK_URL] : undefined,

  // Let the dev server bind to all interfaces so ngrok can reach it when
  // Next.js is started with `next dev -H 0.0.0.0`.
  serverExternalPackages: ["playwright"],

  // Increase the body parser size limit for image uploads through ngrok.
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
