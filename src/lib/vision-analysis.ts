// Vision model integration — types safe for client/server.
// analyzeImageWithVision() is server-only (calls Nvidia MiniMax-M3 API).
// Client components import the result types only.

export type VisionTextRegion = {
  text: string;
  foregroundColor: string;
  backgroundColor: string;
  fontSize: "small" | "large";
  fontWeight: "normal" | "bold";
  location: string;
};

export type VisionColorBlindAssessment = {
  mode: "protanopia" | "deuteranopia" | "tritanopia" | "grayscale";
  problematicRegions: string[];
  severity: "high" | "moderate" | "low";
  description: string;
};

export type VisionFixRecommendation = {
  priority: "required" | "suggested";
  type: "color-change" | "increase-contrast" | "add-background" | "add-overlay";
  description: string;
  cssSnippet?: string;
};

export type ImageAnalysisResult = {
  overallAssessment: string;
  hasText: boolean;
  textRegions: VisionTextRegion[];
  wcagViolations: Array<{
    text: string;
    foreground: string;
    background: string;
    currentRatio: number;
    requiredRatio: number;
    passesAA: boolean;
    passesAAA: boolean;
    recommendation: string;
  }>;
  colorBlindAssessments: VisionColorBlindAssessment[];
  fixRecommendations: VisionFixRecommendation[];
};

/**
 * Builds the system + user prompt for MiniMax-M3 asking it to analyze
 * text accessibility within a single image.
 */
function buildVisionPrompt(): string {
  return `You are a WCAG 2.2 accessibility auditor specializing in color contrast analysis of text rendered inside images. Analyze the provided image and return a JSON object with this exact structure:

{
  "overallAssessment": "1-2 sentence summary of the image's text contrast accessibility",
  "hasText": true,
  "textRegions": [
    {
      "text": "the visible text string",
      "foregroundColor": "#RRGGBB",
      "backgroundColor": "#RRGGBB",
      "fontSize": "small",
      "fontWeight": "normal",
      "location": "top-left"
    }
  ],
  "wcagViolations": [
    {
      "text": "the text that fails contrast",
      "foreground": "#RRGGBB",
      "background": "#RRGGBB",
      "currentRatio": 2.5,
      "requiredRatio": 4.5,
      "passesAA": false,
      "passesAAA": false,
      "recommendation": "Darken the foreground text to #1A1A1A to meet AA"
    }
  ],
  "colorBlindAssessments": [
    {
      "mode": "protanopia",
      "problematicRegions": ["text that becomes hard to read"],
      "severity": "high",
      "description": "Under protanopia, the red text blends into the green background"
    }
  ],
  "fixRecommendations": [
    {
      "priority": "required",
      "type": "color-change",
      "description": "Actionable fix description",
      "cssSnippet": "color: #1A1A1A;"
    }
  ]
}

Rules:
- Detect ALL visible text in the image, including headings, body text, buttons, labels, captions
- Estimate hex colors (#RRGGBB) as precisely as possible from the image
- "fontSize": "large" means text appears >= 18px bold or >= 24px regular; otherwise "small"
- "fontWeight": "bold" if the text appears bold/boldface; otherwise "normal"
- WCAG 2.2 AA requires 4.5:1 for normal text or 3:1 for large text. AAA requires 7:1 for normal or 4.5:1 for large text.
- For each text region where contrast fails any threshold, include it in wcagViolations
- For color-blind assessments, consider how foreground/background color pairs would shift under each condition (protanopia, deuteranopia, tritanopia, grayscale)
- Only include non-empty arrays; if no issues exist, use empty arrays
- "hasText": false if there is no visible text in the image at all
- Return ONLY the JSON object, no other text or markdown`;
}

/**
 * Parses the raw LLM response content and extracts a validated
 * ImageAnalysisResult. Handles markdown code fences and raw JSON.
 */
function parseVisionResponse(rawContent: string): ImageAnalysisResult {
  // Try to extract JSON from markdown code fences first
  const fenceMatch = rawContent.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonStr = fenceMatch ? fenceMatch[1].trim() : rawContent.trim();

  // Try to find a JSON object in the string
  const objectMatch = jsonStr.match(/(\{[\s\S]*\})/);
  const candidate = objectMatch ? objectMatch[1] : jsonStr;

  let parsed: ImageAnalysisResult;
  try {
    parsed = JSON.parse(candidate) as ImageAnalysisResult;
  } catch {
    throw new Error(
      "Failed to parse vision model response as JSON. The model may have returned an unexpected format.",
    );
  }

  // Validate required fields with sensible defaults
  if (typeof parsed.hasText !== "boolean") {
    parsed.hasText = Array.isArray(parsed.textRegions) && parsed.textRegions.length > 0;
  }
  if (typeof parsed.overallAssessment !== "string") {
    parsed.overallAssessment = parsed.hasText
      ? "Text detected in image. See regions below for contrast analysis."
      : "No text detected in this image.";
  }
  if (!Array.isArray(parsed.textRegions)) {
    parsed.textRegions = [];
  }
  if (!Array.isArray(parsed.wcagViolations)) {
    parsed.wcagViolations = [];
  }
  if (!Array.isArray(parsed.colorBlindAssessments)) {
    parsed.colorBlindAssessments = [];
  }
  if (!Array.isArray(parsed.fixRecommendations)) {
    parsed.fixRecommendations = [];
  }

  return parsed;
}

/**
 * Template result returned when the vision model cannot be called.
 * Used as a fallback so the UI always has a valid result shape.
 */
function templateVisionResult(): ImageAnalysisResult {
  return {
    overallAssessment:
      "Vision analysis skipped — NVIDIA API key is not configured. Set NVIDIA_API_KEY in your .env file to enable image text analysis.",
    hasText: false,
    textRegions: [],
    wcagViolations: [],
    colorBlindAssessments: [],
    fixRecommendations: [],
  };
}

/**
 * Calls the Nvidia MiniMax-M3 multimodal API to analyze text accessibility
 * within a single image. Returns a structured result with detected text
 * regions, WCAG violations, color-blind assessments, and fix recommendations.
 *
 * Falls back to a template result if the API key is missing or the call fails.
 */
export async function analyzeImageWithVision(
  imageBase64: string,
  mimeType: string,
): Promise<{ result: ImageAnalysisResult; rawResponse: string }> {
  const apiKey = process.env.NVIDIA_API_KEY;

  if (!apiKey || apiKey === "nvapi-xxxxxxxx") {
    return { result: templateVisionResult(), rawResponse: "" };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000); // 30s per image

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
          model: "minimaxai/minimax-m3",
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: buildVisionPrompt() },
                {
                  type: "image_url",
                  image_url: {
                    url: `data:${mimeType};base64,${imageBase64}`,
                  },
                },
              ],
            },
          ],
          max_tokens: 4096,
          temperature: 0.1,
          top_p: 0.1,
        }),
        signal: controller.signal,
      },
    );

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `NVIDIA API returned ${response.status}${body ? `: ${body.slice(0, 200)}` : ""}`,
      );
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("No content in NVIDIA API response");
    }

    const result = parseVisionResponse(content);
    return { result, rawResponse: content };
  } catch (err) {
    // If the fetch itself was aborted, rethrow so the caller can handle the timeout
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("Vision analysis timed out after 30 seconds.");
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}
