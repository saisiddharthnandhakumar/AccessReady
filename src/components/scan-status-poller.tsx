"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";

/**
 * When the scan is "running", triggers POST /api/scans/[id]/process
 * (which gets its own 300s Vercel invocation), then polls
 * GET /api/scans/[id] every 2 seconds until the scan completes or fails.
 *
 * If the scan stays "running" for more than 3 minutes, shows a warning
 * suggesting the scan may be stuck.
 */
export function ScanStatusPoller({
  scanId,
  status: initialStatus,
}: {
  scanId: string;
  status: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [isStuck, setIsStuck] = useState(false);
  const startedRef = useRef(false);
  const startTime = useRef(Date.now());

  // Trigger the process endpoint once when the component mounts
  // and the scan is still running.
  useEffect(() => {
    if (status !== "running" || startedRef.current) return;
    startedRef.current = true;

    fetch(`/api/scans/${scanId}/process`, { method: "POST" }).catch(() => {
      // Process endpoint may fail; polling will pick up the result
    });
  }, [scanId, status]);

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/scans/${scanId}`);
      if (!res.ok) return;
      const data = (await res.json()) as { status: string };
      if (data.status && data.status !== "running") {
        setStatus(data.status);
        router.refresh();
      }
      if (Date.now() - startTime.current > 180_000) {
        setIsStuck(true);
      }
    } catch {
      // Network error — keep polling
    }
  }, [scanId, router]);

  useEffect(() => {
    if (status !== "running") return;

    // Poll immediately on mount (in case process already finished)
    poll();

    const interval = setInterval(poll, 2000);
    return () => clearInterval(interval);
  }, [status, poll]);

  if (status !== "running") return null;

  return (
    <div className="space-y-2">
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
      {isStuck ? (
        <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning-muted p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
          <div className="space-y-1">
            <p className="font-medium text-warning">Scan is taking longer than expected</p>
            <p className="text-foreground-secondary">
              The scan may have been interrupted.{" "}
              <Link href="/" className="underline hover:text-foreground">
                Return to dashboard
              </Link>{" "}
              and try again. If the issue persists, the site may be blocking automated audits.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
