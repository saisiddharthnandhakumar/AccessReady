// LLM-powered recommendations — types safe for client/server.
// generateRecommendations() is server-only (calls Nvidia API with env var).
// Client components import FixRecommendation type only.

export type FixRecommendation = {
  type:
    | "color-change"
    | "add-overlay"
    | "increase-font-size"
    | "add-background"
    | "increase-weight"
    | "restructure-layout";
  priority: "required" | "suggested";
  description: string;
  cssSnippet?: string;
  newForeground?: string;
  newBackground?: string;
  expectedContrastRatio?: number;
};

type RecommendationParams = {
  foreground: string;
  background: string;
  currentRatio: number;
  requiredRatio: number;
  isLargeText: boolean;
  complianceLevel: "AA" | "AAA";
  heroAnalysis?: {
    hasBackgroundImage: boolean;
    overlaySuggestion?: { type: string; minOpacity: number; cssSnippet: string };
  } | null;
  elementDescription: string;
  fontSize?: number;
  fontWeight?: number;
};

/**
 * Fallback template-based recommendations using color math.
 * Used when the Nvidia API is unavailable.
 */
function templateRecommendations(
  params: RecommendationParams,
): FixRecommendation[] {
  const results: FixRecommendation[] = [];
  const {
    foreground,
    background,
    currentRatio,
    requiredRatio,
    isLargeText,
    heroAnalysis,
  } = params;

  // Determine if we need darker or lighter foreground
  const fgLum = hexLuminance(foreground);
  const bgLum = hexLuminance(background);
  const needsDarkerFg = bgLum > fgLum;

  // Suggest a color change
  const suggestedColor = needsDarkerFg
    ? darkenColor(foreground, 0.3)
    : lightenColor(foreground, 0.3);

  results.push({
    type: "color-change",
    priority: "required",
    description: `Change the foreground text color from ${foreground} to approximately ${suggestedColor} to achieve the required ${requiredRatio}:1 contrast ratio${isLargeText ? " for large text" : ""}.`,
    cssSnippet: `color: ${suggestedColor};`,
    newForeground: suggestedColor,
    expectedContrastRatio: requiredRatio,
  });

  // If text is small, suggest increasing font size to qualify as large text
  if (!isLargeText) {
    results.push({
      type: "increase-font-size",
      priority: "suggested",
      description:
        "Increase font size to at least 18px bold (or 24px regular) to qualify for the relaxed 3:1 large-text threshold. This may be easier than achieving 4.5:1 at the current size.",
      cssSnippet: "font-size: 18px;\nfont-weight: 700;",
    });
  }

  // Hero-specific overlay suggestion
  if (heroAnalysis?.hasBackgroundImage && heroAnalysis?.overlaySuggestion) {
    results.push({
      type: "add-overlay",
      priority: "required",
      description: `Add a ${heroAnalysis.overlaySuggestion.type} translucent overlay at ${Math.round(heroAnalysis.overlaySuggestion.minOpacity * 100)}% opacity behind the text on the hero image.`,
      cssSnippet: heroAnalysis.overlaySuggestion.cssSnippet,
    });
  }

  // Suggest adding a background behind text
  if (!heroAnalysis?.hasBackgroundImage) {
    results.push({
      type: "add-background",
      priority: "suggested",
      description: `Add a solid ${background} background behind the text to ensure consistent contrast.`,
      cssSnippet: `background-color: ${background};`,
    });
  }

  return results;
}

/**
 * Calls the Nvidia Nemotron API to generate contextual fix recommendations.
 * Falls back to template-based recommendations if the API is unavailable.
 */
export async function generateRecommendations(
  params: RecommendationParams,
): Promise<FixRecommendation[]> {
  const apiKey = process.env.NVIDIA_API_KEY;

  if (!apiKey || apiKey === "nvapi-xxxxxxxx") {
    // No valid API key configured — use template fallback
    return templateRecommendations(params);
  }

  try {
    const response = await fetch(
      "https://integrate.api.nvidia.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "nvidia/nemotron-3-super-120b-a12b",
          messages: [
            {
              role: "system",
              content: `You are a WCAG 2.2 accessibility expert specializing in color contrast remediation. Given a contrast violation, generate 1-3 concrete, actionable fix recommendations. Each recommendation must include: type (one of: color-change, add-overlay, increase-font-size, add-background, increase-weight, restructure-layout), priority (required or suggested), a plain-language description, and a CSS snippet if applicable. Respond with a JSON array of recommendation objects.`,
            },
            {
              role: "user",
              content: JSON.stringify({
                foreground: params.foreground,
                background: params.background,
                currentRatio: params.currentRatio.toFixed(2),
                requiredRatio: params.requiredRatio,
                isLargeText: params.isLargeText,
                complianceLevel: params.complianceLevel,
                elementDescription: params.elementDescription,
                fontSize: params.fontSize,
                fontWeight: params.fontWeight,
                heroAnalysis: params.heroAnalysis,
                instruction:
                  "Generate fix recommendations as a JSON array. Each object: { type, priority, description, cssSnippet?, newForeground?, newBackground?, expectedContrastRatio? }",
              }),
            },
          ],
          temperature: 0.3,
          top_p: 0.95,
          max_tokens: 2048,
        }),
        signal: AbortSignal.timeout(15000),
      },
    );

    if (!response.ok) {
      return templateRecommendations(params);
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      return templateRecommendations(params);
    }

    // Parse the JSON response — try to extract a JSON array
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return templateRecommendations(params);
    }

    const parsed = JSON.parse(jsonMatch[0]) as FixRecommendation[];
    return Array.isArray(parsed) ? parsed : templateRecommendations(params);
  } catch {
    return templateRecommendations(params);
  }
}

// ── Color math helpers (used by template fallback) ──

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace("#", "");
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}

function rgbToHex(rgb: { r: number; g: number; b: number }): string {
  return `#${[rgb.r, rgb.g, rgb.b]
    .map((c) =>
      Math.max(0, Math.min(255, Math.round(c)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`.toUpperCase();
}

function hexLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const channels = [r, g, b].map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function darkenColor(hex: string, amount: number): string {
  const rgb = hexToRgb(hex);
  return rgbToHex({
    r: rgb.r * (1 - amount),
    g: rgb.g * (1 - amount),
    b: rgb.b * (1 - amount),
  });
}

function lightenColor(hex: string, amount: number): string {
  const rgb = hexToRgb(hex);
  return rgbToHex({
    r: rgb.r + (255 - rgb.r) * amount,
    g: rgb.g + (255 - rgb.g) * amount,
    b: rgb.b + (255 - rgb.b) * amount,
  });
}
