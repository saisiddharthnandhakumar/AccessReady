import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { normalizeUrl } from "@/lib/url";
import { getApplicableRegulations } from "@/lib/compliance";
import type { ScanMetadataInput } from "@/lib/scan-metadata";

export const runtime = "nodejs";
export const maxDuration = 120;

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

  // Validate browser configuration early so we can fail fast.
  const browserWs = process.env.BROWSERLESS_WS_ENDPOINT;
  const browserKey = process.env.BROWSERLESS_API_KEY;
  const remoteEndpoint =
    (browserWs && browserWs.startsWith("wss://") ? browserWs : null) ??
    (browserKey && browserKey !== "undefined"
      ? `wss://chrome.browserless.io?token=${browserKey}`
      : null);

  if (!remoteEndpoint) {
    return NextResponse.json(
      {
        error:
          "No remote browser configured. Set BROWSERLESS_API_KEY or " +
          "BROWSERLESS_WS_ENDPOINT in Vercel environment variables. " +
          "Sign up at https://browserless.io (free tier available).",
      },
      { status: 500 },
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

  // Run the scan synchronously — await it directly instead of using
  // fire-and-forget or after(), which are unreliable on serverless.
  // The scan function handles its own DB updates (completed / failed).
  try {
    const { runContrastScan } = await import("@/lib/scan");
    await runContrastScan(parsed.data.url, {}, metadata, scan.id);
  } catch (err) {
    // runContrastScan already updates the DB row to "failed" in its own
    // catch block. We log here for Vercel observability and return the
    // scan ID so the client can see the failure reason on the detail page.
    console.error(
      "Scan failed:",
      err instanceof Error ? err.message : err,
    );
  }

  return NextResponse.json({ id: scan.id });
}
