import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { runContrastScan } from "@/lib/scan";
import type { ScanMetadataInput } from "@/lib/scan-metadata";

export const runtime = "nodejs";
// This endpoint gets its own function invocation with a fresh timeout
// clock — independent of the POST /api/scans handler that created the
// scan record.  The scan runs synchronously here.
export const maxDuration = 300;

/**
 * POST /api/scans/[id]/process
 *
 * Runs the contrast scan for an existing scan record.  Called by the
 * client after POST /api/scans returns the scan ID.  Because this is
 * a separate function invocation, it gets a fresh 300s timeout clock
 * — the scan does not share the POST handler's 15s budget.
 *
 * Idempotent: if the scan is already completed or failed, returns the
 * current status without re-running.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: scanId } = await params;

  const scan = await prisma.scan.findUnique({
    where: { id: scanId },
    select: {
      id: true,
      status: true,
      url: true,
      productType: true,
      productTypeOther: true,
      targetMarket: true,
      targetMarketOther: true,
      industry: true,
      industryOther: true,
      notes: true,
    },
  });

  if (!scan) {
    return NextResponse.json({ error: "Scan not found" }, { status: 404 });
  }

  if (scan.status !== "running") {
    return NextResponse.json({
      id: scan.id,
      status: scan.status,
      message:
        scan.status === "completed"
          ? "Scan has already completed."
          : scan.status === "failed"
            ? "Scan has already failed."
            : `Scan status is "${scan.status}" — nothing to process.`,
    });
  }

  const metadata: ScanMetadataInput = {
    productType: scan.productType ?? "",
    productTypeOther: scan.productTypeOther ?? null,
    targetMarket: scan.targetMarket ?? "",
    targetMarketOther: scan.targetMarketOther ?? null,
    industry: scan.industry ?? "",
    industryOther: scan.industryOther ?? null,
    notes: scan.notes ?? null,
  };

  try {
    const result = await runContrastScan(scan.url, {}, metadata, scanId);
    return NextResponse.json({
      id: result.id,
      status: result.status,
      pageCount: result.pageCount,
      violationCount: result.violationCount,
    });
  } catch (err) {
    // runContrastScan updates the DB to "failed" in its own catch block.
    // We still return a 500 so the caller knows the scan didn't succeed.
    console.error(
      `Process endpoint: scan ${scanId} failed:`,
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json(
      {
        id: scanId,
        status: "failed",
        error: err instanceof Error ? err.message : "Scan processing failed.",
      },
      { status: 500 },
    );
  }
}
