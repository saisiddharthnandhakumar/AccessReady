import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { normalizeUrl } from "@/lib/url";
import { getApplicableRegulations } from "@/lib/compliance";
import type { ScanMetadataInput } from "@/lib/scan-metadata";

export const runtime = "nodejs";
export const maxDuration = 300;

const scanRequestSchema = z.object({
  url: z
    .string()
    .trim()
    .min(1, "Enter a website URL.")
    .url("Enter a valid absolute URL."),
  productType: z.string().min(1, "Product type is required."),
  productTypeOther: z.string().optional(),
  targetMarket: z.string().min(1, "Target market is required."),
  targetMarketOther: z.string().optional(),
  industry: z.string().min(1, "Industry is required."),
  industryOther: z.string().optional(),
  notes: z.string().optional(),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = scanRequestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 },
    );
  }

  // Create the scan record immediately (non-blocking) so ngrok
  // and other proxies don't time out waiting for axe-core + Playwright.
  const normalizedUrl = normalizeUrl(parsed.data.url);
  const metadata: ScanMetadataInput = {
    productType: parsed.data.productType,
    productTypeOther: parsed.data.productTypeOther ?? null,
    targetMarket: parsed.data.targetMarket,
    targetMarketOther: parsed.data.targetMarketOther ?? null,
    industry: parsed.data.industry,
    industryOther: parsed.data.industryOther ?? null,
    notes: parsed.data.notes ?? null,
  };

  const regulations =
    metadata.targetMarket && metadata.industry
      ? getApplicableRegulations(metadata.targetMarket, metadata.industry)
      : [];

  const scan = await prisma.scan.create({
    data: {
      url: parsed.data.url.trim(),
      normalizedUrl,
      status: "running",
      productType: metadata.productType ?? null,
      productTypeOther: metadata.productTypeOther ?? null,
      targetMarket: metadata.targetMarket ?? null,
      targetMarketOther: metadata.targetMarketOther ?? null,
      industry: metadata.industry ?? null,
      industryOther: metadata.industryOther ?? null,
      applicableRegulations:
        regulations.length > 0 ? JSON.stringify(regulations) : null,
      notes: metadata.notes ?? null,
    },
  });

  // Fire-and-forget: the scan runs in the background and updates the
  // record when it finishes (or fails).  The client polls /api/scans/:id
  // to learn when the scan is done.
  import("@/lib/scan").then(({ runContrastScan }) =>
    runContrastScan(parsed.data.url, {}, metadata, scan.id).catch(() => {
      // runContrastScan already updates the DB row on failure;
      // we swallow here so the unhandled rejection doesn't crash the
      // dev server.
    }),
  );

  return NextResponse.json({ id: scan.id });
}
