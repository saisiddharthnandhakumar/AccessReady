import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { buildVpatReport, renderReportHtml } from "@/lib/report-generator";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const scan = await prisma.scan.findUnique({
    where: { id },
    include: {
      pages: {
        orderBy: { createdAt: "asc" },
        include: {
          violations: {
            orderBy: [{ impact: "asc" }, { createdAt: "asc" }],
          },
        },
      },
    },
  });

  if (!scan) {
    return NextResponse.json(
      { error: "Scan not found." },
      { status: 404 },
    );
  }

  const report = buildVpatReport(scan);
  const html = renderReportHtml(report);

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `attachment; filename="vpat-report-${scan.id}.html"`,
    },
  });
}
