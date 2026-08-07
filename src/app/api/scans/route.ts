import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { normalizeUrl } from "@/lib/url";
import { getApplicableRegulations } from "@/lib/compliance";
import type { ScanMetadataInput } from "@/lib/scan-metadata";

export const runtime = "nodejs";
// Just a DB write + validation — the scan itself runs in
// POST /api/scans/[id]/process which gets its own invocation.
export const maxDuration = 15;

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

  // Create the scan record and return immediately.
  // The actual scan is triggered by POST /api/scans/[id]/process
  // which gets its own function invocation with a fresh timeout clock.
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

  return NextResponse.json({ id: scan.id });
}
