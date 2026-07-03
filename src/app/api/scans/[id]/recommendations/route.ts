import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { generateRecommendations } from "@/lib/recommendations";
import { type HeroAnalysis } from "@/lib/hero-detection";

export const runtime = "nodejs";

const requestSchema = z.object({
  violationId: z.string().min(1),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: scanId } = await params;
  const body = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 },
    );
  }

  // Fetch the violation with its color data and section info
  const scan = await prisma.scan.findUnique({
    where: { id: scanId },
    include: {
      pages: {
        include: {
          violations: {
            where: { id: parsed.data.violationId },
          },
        },
      },
    },
  });

  const violation = scan?.pages.flatMap((p) => p.violations).find(
    (v) => v.id === parsed.data.violationId,
  );

  if (!violation) {
    return NextResponse.json(
      { error: "Violation not found." },
      { status: 404 },
    );
  }

  // Parse color data
  let foreground = "#000000";
  let background = "#FFFFFF";
  let currentRatio = 1;
  let isLargeText = false;

  try {
    if (violation.colorDataJson) {
      const cd = JSON.parse(violation.colorDataJson) as Record<string, unknown>;
      if (typeof cd.foreground === "string") foreground = cd.foreground;
      if (typeof cd.background === "string") background = cd.background;
      if (typeof cd.contrastRatio === "number") currentRatio = cd.contrastRatio;
      if (typeof cd.isLargeText === "boolean") isLargeText = cd.isLargeText;
    }
  } catch {
    // Use defaults
  }

  // Parse hero analysis
  let heroAnalysis: HeroAnalysis | null = null;
  try {
    if (violation.heroAnalysisJson) {
      heroAnalysis = JSON.parse(violation.heroAnalysisJson) as HeroAnalysis;
    }
  } catch {
    heroAnalysis = null;
  }

  // Determine element description from violation data
  const elementDescription = violation.help || violation.description || "Unknown element";

  // Determine required ratio
  const requiredRatio = isLargeText ? 3.0 : 4.5;

  const recommendations = await generateRecommendations({
    foreground,
    background,
    currentRatio,
    requiredRatio,
    isLargeText,
    complianceLevel: "AA",
    heroAnalysis,
    elementDescription,
  });

  return NextResponse.json({ recommendations });
}
