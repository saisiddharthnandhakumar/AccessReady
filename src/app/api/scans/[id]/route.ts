import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 15;

/**
 * GET /api/scans/[id]
 *
 * Lightweight status endpoint used by the client-side poller.
 * Returns only the fields needed to determine if a scan is
 * still running, completed, or failed — avoids the overhead
 * of rendering the full server component on every poll.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const scan = await prisma.scan.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      error: true,
      pageCount: true,
      violationCount: true,
      finishedAt: true,
      createdAt: true,
    },
  });

  if (!scan) {
    return NextResponse.json({ error: "Scan not found" }, { status: 404 });
  }

  return NextResponse.json(scan);
}
