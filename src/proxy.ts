import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const response = NextResponse.next();

  // Tell ngrok to skip its interstitial "warning" page.
  // Without this, ngrok injects a JS-heavy interstitial that breaks
  // event handlers on buttons and form submissions.
  response.headers.set("ngrok-skip-browser-warning", "true");

  // Allow the ngrok host through — Next.js otherwise rejects requests
  // whose Host header doesn't match localhost.
  const host = request.headers.get("host") ?? "";
  if (host.includes("ngrok")) {
    response.headers.set("Access-Control-Allow-Origin", `https://${host}`);
    response.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  }

  return response;
}

export const config = {
  // Apply to all routes
  matcher: "/((?!_next/static|_next/image|favicon.ico|audit-screenshots).*)",
};
