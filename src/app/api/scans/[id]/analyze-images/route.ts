import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { runDeferredImageAnalysis } from "@/lib/scan";

export const runtime = "nodejs";
export const maxDuration = 55;

/**
 * POST /api/scans/[id]/analyze-images
 *
 * Runs deferred NVIDIA vision analysis on all pending images for a scan.
 * Call this to recover image analysis if the fire-and-forget Phase 2 was
 * interrupted (e.g. Vercel killed the function after the HTTP response).
 *
 * Processes images sequentially to avoid rate-limiting the vision API.
 * Returns counts of completed, failed, and skipped analyses.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: scanId } = await params;

  // Verify the scan exists
  const scan = await prisma.scan.findUnique({
    where: { id: scanId },
    select: { id: true, status: true },
  });

  if (!scan) {
    return NextResponse.json({ error: "Scan not found" }, { status: 404 });
  }

  // Find all pending image analyses across all pages of this scan
  const pages = await prisma.pageResult.findMany({
    where: { scanId },
    select: {
      id: true,
      imageAnalyses: {
        where: { status: "pending" },
        select: { id: true },
      },
    },
  });

  const pendingIds = pages.flatMap((p) => p.imageAnalyses.map((ia) => ia.id));

  if (pendingIds.length === 0) {
    return NextResponse.json({
      message: "No pending image analyses found.",
      completed: 0,
      failed: 0,
      skipped: 0,
    });
  }

  let completed = 0;
  let failed = 0;
  let skipped = 0;

  // Process sequentially to respect API rate limits
  for (const id of pendingIds) {
    try {
      await runDeferredImageAnalysis(id);
      // Check the result status
      const record = await prisma.imageAnalysis.findUnique({
        where: { id },
        select: { status: true },
      });
      if (record?.status === "completed") completed++;
      else if (record?.status === "skipped") skipped++;
      else failed++;
    } catch {
      failed++;
    }
  }

  return NextResponse.json({
    message: `Processed ${pendingIds.length} image(s).`,
    completed,
    failed,
    skipped,
  });
}
