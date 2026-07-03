"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * When the scan is still "running", polls the server every 2 seconds
 * so the page re-renders with latest data once the background scan
 * finishes (or fails).  Stops polling after 5 minutes to avoid
 * infinite loops on stuck scans.
 */
export function ScanStatusPoller({
  scanId,
  status,
}: {
  scanId: string;
  status: string;
}) {
  const router = useRouter();
  const isRunning = status === "running";

  useEffect(() => {
    if (!isRunning) return;

    let attempts = 0;
    const MAX_ATTEMPTS = 150; // 5 minutes at 2-second intervals

    const interval = setInterval(() => {
      attempts += 1;
      if (attempts > MAX_ATTEMPTS) {
        clearInterval(interval);
        return;
      }
      router.refresh();
    }, 2000);

    return () => clearInterval(interval);
  }, [isRunning, router, scanId]);

  if (!isRunning) return null;

  return (
    <div className="flex items-center gap-2 text-sm text-foreground-secondary animate-pulse">
      <span className="flex gap-1">
        <span
          className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce"
          style={{ animationDelay: "0ms" }}
        />
        <span
          className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce"
          style={{ animationDelay: "150ms" }}
        />
        <span
          className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce"
          style={{ animationDelay: "300ms" }}
        />
      </span>
      <span>Scan in progress — this page updates automatically.</span>
    </div>
  );
}
