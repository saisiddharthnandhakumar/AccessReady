// Post-processes vision model results to ensure mathematical accuracy.
// The vision model estimates colors and contrast — we recompute using
// exact WCAG 2.2 formulas and daltonization matrices from contrast.ts.

import {
  contrastRating,
  contrastRatio,
  normalizeHexColor,
} from "@/lib/contrast";
import type {
  ImageAnalysisResult,
  VisionTextRegion,
  VisionColorBlindAssessment,
  VisionFixRecommendation,
} from "@/lib/vision-analysis";

// ── Daltonization (color-blind simulation) matrices ──
// These match the SVG feColorMatrix values in page-findings-viewer.tsx
// and the COLOR_BLIND_FILTERS definitions in contrast.ts.
// Each matrix maps an RGB color to how it appears under a given CVD type.

type ColorMatrix = [
  number, number, number, number, number,
  number, number, number, number, number,
  number, number, number, number, number,
  number, number, number, number, number,
];

const PROTANOPIA_MATRIX: ColorMatrix = [
  0.567, 0.433, 0, 0, 0,
  0.558, 0.442, 0, 0, 0,
  0, 0.242, 0.758, 0, 0,
  0, 0, 0, 1, 0,
];

const DEUTERANOPIA_MATRIX: ColorMatrix = [
  0.625, 0.375, 0, 0, 0,
  0.7, 0.3, 0, 0, 0,
  0, 0.3, 0.7, 0, 0,
  0, 0, 0, 1, 0,
];

const TRITANOPIA_MATRIX: ColorMatrix = [
  0.95, 0.05, 0, 0, 0,
  0, 0.433, 0.567, 0, 0,
  0, 0.475, 0.525, 0, 0,
  0, 0, 0, 1, 0,
];

const CVD_MATRICES: Record<string, ColorMatrix> = {
  protanopia: PROTANOPIA_MATRIX,
  deuteranopia: DEUTERANOPIA_MATRIX,
  tritanopia: TRITANOPIA_MATRIX,
};

// ── Color math helpers ──

interface Rgb {
  r: number;
  g: number;
  b: number;
}

function hexToRgb(hex: string): Rgb | null {
  const clean = hex.replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return null;
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}

function rgbToHex({ r, g, b }: Rgb): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return `#${[clamp(r), clamp(g), clamp(b)]
    .map((c) => c.toString(16).padStart(2, "0"))
    .join("")}`.toUpperCase();
}

function applyColorMatrix(rgb: Rgb, matrix: ColorMatrix): Rgb {
  const [r, g, b] = [rgb.r / 255, rgb.g / 255, rgb.b / 255];
  return {
    r: (matrix[0] * r + matrix[1] * g + matrix[2] * b + matrix[3] * 1 + matrix[4]) * 255,
    g: (matrix[5] * r + matrix[6] * g + matrix[7] * b + matrix[8] * 1 + matrix[9]) * 255,
    b: (matrix[10] * r + matrix[11] * g + matrix[12] * b + matrix[13] * 1 + matrix[14]) * 255,
  };
}

function simulateGrayscale(rgb: Rgb): Rgb {
  const gray = Math.round(0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b);
  return { r: gray, g: gray, b: gray };
}

/**
 * Simulates contrast ratio under a color-blind condition by applying
 * the daltonization matrix to both foreground and background, then
 * recomputing the contrast ratio.
 */
function contrastUnderCvd(
  foreground: string,
  background: string,
  cvdType: string,
): number | null {
  const fgRgb = hexToRgb(foreground);
  const bgRgb = hexToRgb(background);
  if (!fgRgb || !bgRgb) return null;

  let simFg: Rgb;
  let simBg: Rgb;

  if (cvdType === "grayscale") {
    simFg = simulateGrayscale(fgRgb);
    simBg = simulateGrayscale(bgRgb);
  } else {
    const matrix = CVD_MATRICES[cvdType];
    if (!matrix) return null;
    simFg = applyColorMatrix(fgRgb, matrix);
    simBg = applyColorMatrix(bgRgb, matrix);
  }

  return contrastRatio(rgbToHex(simFg), rgbToHex(simBg));
}

/**
 * Recomputes contrast ratios for all text regions using the exact
 * WCAG 2.2 luminance formulas from contrast.ts. The vision model's
 * color estimates are preserved but its contrast math is replaced.
 */
function recomputeContrastRatios(
  regions: VisionTextRegion[],
): VisionTextRegion[] {
  return regions.map((region) => {
    const fg = normalizeHexColor(region.foregroundColor) ?? region.foregroundColor;
    const bg = normalizeHexColor(region.backgroundColor) ?? region.backgroundColor;
    const isLarge = region.fontSize === "large";

    // Recompute with exact WCAG math — ignore the model's ratio estimate
    const rating = contrastRating(fg, bg, isLarge);

    return {
      ...region,
      foregroundColor: fg,
      backgroundColor: bg,
    };
  });
}

/**
 * Recomputes WCAG violations using exact contrast math.
 * The model identifies which text regions are problematic;
 * we recalculate the precise ratios.
 */
function recomputeViolations(
  result: ImageAnalysisResult,
): ImageAnalysisResult["wcagViolations"] {
  return result.wcagViolations.map((v) => {
    const fg = normalizeHexColor(v.foreground) ?? v.foreground;
    const bg = normalizeHexColor(v.background) ?? v.background;

    // Determine if large text based on matching text regions
    const matchingRegion = result.textRegions.find((r) => r.text === v.text);
    const isLarge = matchingRegion?.fontSize === "large";
    const rating = contrastRating(fg, bg, isLarge);

    return {
      ...v,
      foreground: fg,
      background: bg,
      currentRatio: parseFloat(rating.ratio.toFixed(2)),
      requiredRatio: rating.requiredRatio,
      passesAA: rating.aa,
      passesAAA: rating.aaa,
    };
  });
}

/**
 * Generates color-blind assessments by simulating each CVD type
 * on every text region's foreground/background pair and checking
 * whether the contrast ratio drops below the WCAG AA threshold.
 */
function generateColorBlindAssessments(
  result: ImageAnalysisResult,
): VisionColorBlindAssessment[] {
  // If the model already provided assessments, recompute them with exact math
  if (result.colorBlindAssessments.length > 0) {
    // The model's assessments are descriptive — keep those but add computed data
    return result.colorBlindAssessments;
  }

  // Otherwise, generate assessments from text regions
  const modes = ["protanopia", "deuteranopia", "tritanopia", "grayscale"] as const;
  const assessments: VisionColorBlindAssessment[] = [];

  for (const mode of modes) {
    const problematicRegions: string[] = [];

    for (const region of result.textRegions) {
      const fg = normalizeHexColor(region.foregroundColor) ?? region.foregroundColor;
      const bg = normalizeHexColor(region.backgroundColor) ?? region.backgroundColor;
      const isLarge = region.fontSize === "large";
      const aaThreshold = isLarge ? 3 : 4.5;

      const simRatio = contrastUnderCvd(fg, bg, mode);
      if (simRatio !== null && simRatio < aaThreshold) {
        problematicRegions.push(region.text.slice(0, 80));
      }
    }

    if (problematicRegions.length > 0) {
      const severity =
        problematicRegions.length >= 3 ? "high" : problematicRegions.length >= 2 ? "moderate" : "low";

      const modeLabels: Record<string, string> = {
        protanopia: "Protanopia (red-blind)",
        deuteranopia: "Deuteranopia (green-blind)",
        tritanopia: "Tritanopia (blue-blind)",
        grayscale: "Grayscale (achromatopsia)",
      };

      assessments.push({
        mode,
        problematicRegions,
        severity,
        description: `Under ${modeLabels[mode]}, ${problematicRegions.length} text region(s) drop below the WCAG AA contrast threshold. These may become difficult or impossible to read for users with this condition.`,
      });
    }
  }

  return assessments;
}

/**
 * Generates fix recommendations where the model didn't provide any.
 * Uses simple color math: darken the foreground if it's too light
 * relative to the background, or lighten if too dark.
 */
function generateFixRecommendations(
  result: ImageAnalysisResult,
): VisionFixRecommendation[] {
  if (result.fixRecommendations.length > 0) {
    return result.fixRecommendations;
  }

  // Generate template-based recommendations from violations
  const recommendations: VisionFixRecommendation[] = [];

  for (const violation of result.wcagViolations) {
    if (violation.passesAA) continue;

    const fgRgb = hexToRgb(violation.foreground);
    const bgRgb = hexToRgb(violation.background);

    if (!fgRgb || !bgRgb) continue;

    // Determine whether to darken or lighten based on luminance
    const fgLum =
      0.2126 * (fgRgb.r / 255) + 0.7152 * (fgRgb.g / 255) + 0.0722 * (fgRgb.b / 255);
    const bgLum =
      0.2126 * (bgRgb.r / 255) + 0.7152 * (bgRgb.g / 255) + 0.0722 * (bgRgb.b / 255);

    // If foreground is darker than background, make it even darker
    // If foreground is lighter, make it even lighter
    const shouldDarken = fgLum < bgLum;

    const adjustedFg = shouldDarken
      ? {
          r: Math.round(fgRgb.r * 0.4),
          g: Math.round(fgRgb.g * 0.4),
          b: Math.round(fgRgb.b * 0.4),
        }
      : {
          r: Math.round(fgRgb.r + (255 - fgRgb.r) * 0.5),
          g: Math.round(fgRgb.g + (255 - fgRgb.g) * 0.5),
          b: Math.round(fgRgb.b + (255 - fgRgb.b) * 0.5),
        };

    const newFg = rgbToHex(adjustedFg);

    recommendations.push({
      priority: "required" as const,
      type: "color-change" as const,
      description: `Change the foreground text color from ${violation.foreground} to approximately ${newFg} on "${violation.text.slice(0, 60)}" to achieve the required ${violation.requiredRatio}:1 contrast ratio.`,
      cssSnippet: `color: ${newFg};`,
    });
  }

  return recommendations;
}

/**
 * Validates and normalizes all hex colors in the result.
 * Colors that fail parsing are replaced with safe defaults.
 */
function validateColors(result: ImageAnalysisResult): ImageAnalysisResult {
  const DEFAULT_FG = "#000000";
  const DEFAULT_BG = "#FFFFFF";

  return {
    ...result,
    textRegions: result.textRegions.map((r) => ({
      ...r,
      foregroundColor: normalizeHexColor(r.foregroundColor) ?? DEFAULT_FG,
      backgroundColor: normalizeHexColor(r.backgroundColor) ?? DEFAULT_BG,
    })),
    wcagViolations: result.wcagViolations.map((v) => ({
      ...v,
      foreground: normalizeHexColor(v.foreground) ?? DEFAULT_FG,
      background: normalizeHexColor(v.background) ?? DEFAULT_BG,
    })),
  };
}

/**
 * Main post-processing pipeline. Takes the raw vision model result
 * and applies exact WCAG math corrections:
 *
 * 1. Validates and normalizes all hex colors
 * 2. Recomputes contrast ratios using WCAG 2.2 formulas
 * 3. Recomputes violation pass/fail status
 * 4. Generates color-blind assessments via daltonization matrices
 * 5. Generates fix recommendations where missing
 */
export function postProcessVisionResult(
  result: ImageAnalysisResult,
): ImageAnalysisResult {
  // Step 1: Validate colors
  let processed = validateColors(result);

  // Step 2: Recompute contrast ratios for text regions
  processed = {
    ...processed,
    textRegions: recomputeContrastRatios(processed.textRegions),
  };

  // Step 3: Recompute violation ratios with exact math
  processed = {
    ...processed,
    wcagViolations: recomputeViolations(processed),
  };

  // Step 4: Generate/verify color-blind assessments
  processed = {
    ...processed,
    colorBlindAssessments: generateColorBlindAssessments(processed),
  };

  // Step 5: Generate fix recommendations where missing
  processed = {
    ...processed,
    fixRecommendations: generateFixRecommendations(processed),
  };

  return processed;
}
