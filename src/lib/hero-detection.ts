// Hero section detection — types safe for client/server.
// (Client components import HeroAnalysis type.)

export type HeroAnalysis = {
  hasBackgroundImage: boolean;
  backgroundImageUrl?: string;
  hasTextOverlay: boolean;
  textOverlayElements: string[];
  dominantImageColor?: string;
  overlaySuggestion?: {
    type: "dark" | "light";
    minOpacity: number;
    cssSnippet: string;
  };
};

/**
 * Runs in page.evaluate() context for elements classified as "hero" by
 * page-sections.ts. Analyzes whether the hero container has a CSS
 * background-image with text positioned over it, and computes overlay
 * suggestions.
 *
 * This is DOM-based (not vision-based) since the current LLM (Nemotron 3
 * Super 120B) is text-only. DOM analysis is more reliable for this use
 * case anyway — we have direct access to CSS computed styles.
 */
export function analyzeHeroSection(
  selector: string[],
  foregroundColor: string,
  backgroundColor: string,
): HeroAnalysis | null {
  // Find the matching hero element
  let element: HTMLElement | null = null;
  for (const sel of selector) {
    try {
      const el = document.querySelector(sel);
      if (el instanceof HTMLElement) {
        element = el;
        break;
      }
    } catch {
      continue;
    }
  }

  if (!element) {
    return null;
  }

  const styles = window.getComputedStyle(element);
  const hasBackgroundImage = Boolean(
    styles.backgroundImage && styles.backgroundImage !== "none",
  );
  const backgroundImageUrl = hasBackgroundImage
    ? styles.backgroundImage.replace(/^url\(["']?|["']?\)$/g, "") || undefined
    : undefined;

  // Find text elements that are children of the hero container
  const textElements = element.querySelectorAll(
    "h1, h2, h3, h4, h5, h6, p, span, a, button, label, li, div",
  );
  const textOverlayElements: string[] = [];

  for (const textEl of textElements) {
    if (!(textEl instanceof HTMLElement)) {
      continue;
    }

    const textContent = textEl.textContent?.trim();
    if (!textContent || textContent.length < 2) {
      continue;
    }

    // Check if this text element has visible text content positioned over the hero
    const textRect = textEl.getBoundingClientRect();
    if (textRect.width > 0 && textRect.height > 0) {
      textOverlayElements.push(textContent.slice(0, 120));
    }
  }

  const hasTextOverlay = textOverlayElements.length > 0;

  // Sample the dominant image color using a hidden canvas
  let dominantImageColor: string | undefined;
  if (hasBackgroundImage && hasTextOverlay) {
    try {
      // Create a small offscreen canvas to sample the rendered hero background
      const canvas = document.createElement("canvas");
      canvas.width = 100;
      canvas.height = 100;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        // Draw a sample from the center of the hero element
        // (where text-over-image contrast matters most)
        const rect = element.getBoundingClientRect();
        // We can't directly sample the rendered background, so we use
        // the computed background-color as a fallback
        const bgColor = styles.backgroundColor;
        if (bgColor && bgColor !== "rgba(0, 0, 0, 0)" && bgColor !== "transparent") {
          dominantImageColor = bgColor;
        }
      }
    } catch {
      // Sampling failed — not critical
    }
  }

  // Compute overlay suggestion
  let overlaySuggestion: HeroAnalysis["overlaySuggestion"];
  if (hasBackgroundImage && hasTextOverlay && foregroundColor && backgroundColor) {
    overlaySuggestion = computeOverlaySuggestion(
      dominantImageColor ?? "#808080",
      foregroundColor,
      4.5, // WCAG AA minimum for normal text
    );
  }

  return {
    hasBackgroundImage,
    backgroundImageUrl,
    hasTextOverlay,
    textOverlayElements,
    dominantImageColor,
    overlaySuggestion,
  };
}

/**
 * Calculates the minimum opacity of a dark or light overlay needed
 * to achieve the required contrast ratio between the text and the
 * background image.
 */
export function computeOverlaySuggestion(
  dominantImageColor: string,
  textColor: string,
  requiredRatio: number,
): { type: "dark" | "light"; minOpacity: number; cssSnippet: string } {
  // Parse colors
  const parseHex = (hex: string) => {
    const clean = hex.replace("#", "");
    return {
      r: parseInt(clean.slice(0, 2), 16),
      g: parseInt(clean.slice(2, 4), 16),
      b: parseInt(clean.slice(4, 6), 16),
    };
  };

  let imageRgb: { r: number; g: number; b: number };
  let textRgb: { r: number; g: number; b: number };

  try {
    imageRgb = parseHex(dominantImageColor);
    textRgb = parseHex(textColor);
  } catch {
    return {
      type: "dark",
      minOpacity: 0.45,
      cssSnippet:
        "background: linear-gradient(rgba(0,0,0,0.45), rgba(0,0,0,0.45));",
    };
  }

  // Luminance of image background
  const imageLum = relativeLuminance(imageRgb);
  // Luminance of text
  const textLum = relativeLuminance(textRgb);

  // If image is light (high luminance), use dark overlay; if dark, use light
  const type: "dark" | "light" = imageLum > 0.5 ? "dark" : "light";
  const overlayColor = type === "dark" ? { r: 0, g: 0, b: 0 } : { r: 255, g: 255, b: 255 };

  // Calculate minimum opacity to achieve required ratio
  // Overlay blends with image: result = overlay * opacity + image * (1 - opacity)
  // We need: contrast(text, result) >= requiredRatio
  let minOpacity = 0;
  for (let opacity = 0; opacity <= 1; opacity += 0.05) {
    const blendedRgb = {
      r: overlayColor.r * opacity + imageRgb.r * (1 - opacity),
      g: overlayColor.g * opacity + imageRgb.g * (1 - opacity),
      b: overlayColor.b * opacity + imageRgb.b * (1 - opacity),
    };
    const blendedLum = relativeLuminance(blendedRgb);
    const ratio =
      (Math.max(textLum, blendedLum) + 0.05) /
      (Math.min(textLum, blendedLum) + 0.05);

    if (ratio >= requiredRatio) {
      minOpacity = opacity;
      break;
    }
  }

  // Round up to nearest 0.05
  minOpacity = Math.ceil(minOpacity / 0.05) * 0.05;

  // Ensure minimum of 0.1 for a visible overlay
  minOpacity = Math.max(0.1, minOpacity);

  const opacityPercent = Math.round(minOpacity * 100);
  const rgbaColor =
    type === "dark"
      ? `rgba(0,0,0,${minOpacity.toFixed(2)})`
      : `rgba(255,255,255,${minOpacity.toFixed(2)})`;

  return {
    type,
    minOpacity,
    cssSnippet: `background: linear-gradient(${rgbaColor}, ${rgbaColor});\n/* Add this to the hero container to create a ${opacityPercent}% ${type} overlay behind the text */`,
  };
}

function relativeLuminance(rgb: {
  r: number;
  g: number;
  b: number;
}): number {
  const channels = [rgb.r, rgb.g, rgb.b].map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}
