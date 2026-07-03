export type RgbColor = {
  r: number;
  g: number;
  b: number;
};

export type ContrastRating = {
  ratio: number;
  aa: boolean;
  aaa: boolean;
  requiredRatio: number;
};

export type ColorData = {
  foreground: string;
  background: string;
  contrastRatio: number;
  sampleText?: string;
  source: "axe";
  isLargeText?: boolean;
};

export type ColorBlindMode =
  | "normal"
  | "protanopia"
  | "deuteranopia"
  | "tritanopia"
  | "grayscale";

const HEX_COLOR_PATTERN = /^#?([a-f\d]{3}|[a-f\d]{6})$/i;
const RGB_COLOR_PATTERN =
  /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*[\d.]+)?\s*\)$/i;

export const COLOR_BLIND_FILTERS: Record<ColorBlindMode, string> = {
  normal: "none",
  protanopia: "url(#accessready-protanopia)",
  deuteranopia: "url(#accessready-deuteranopia)",
  tritanopia: "url(#accessready-tritanopia)",
  grayscale: "grayscale(1)",
};

function clampChannel(value: number) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

export function rgbToHex({ r, g, b }: RgbColor) {
  return `#${[r, g, b]
    .map((channel) => clampChannel(channel).toString(16).padStart(2, "0"))
    .join("")}`.toUpperCase();
}

export function parseCssColor(input: string | null | undefined): RgbColor | null {
  if (!input) {
    return null;
  }

  const trimmed = input.trim();
  const hexMatch = trimmed.match(HEX_COLOR_PATTERN);
  if (hexMatch) {
    const value = hexMatch[1];
    const expanded =
      value.length === 3
        ? value
            .split("")
            .map((character) => character + character)
            .join("")
        : value;

    return {
      r: Number.parseInt(expanded.slice(0, 2), 16),
      g: Number.parseInt(expanded.slice(2, 4), 16),
      b: Number.parseInt(expanded.slice(4, 6), 16),
    };
  }

  const rgbMatch = trimmed.match(RGB_COLOR_PATTERN);
  if (rgbMatch) {
    return {
      r: clampChannel(Number(rgbMatch[1])),
      g: clampChannel(Number(rgbMatch[2])),
      b: clampChannel(Number(rgbMatch[3])),
    };
  }

  return null;
}

export function normalizeHexColor(input: string | null | undefined) {
  const parsed = parseCssColor(input);
  return parsed ? rgbToHex(parsed) : null;
}

export function relativeLuminance(color: RgbColor) {
  const [r, g, b] = [color.r, color.g, color.b].map((channel) => {
    const value = channel / 255;
    return value <= 0.03928
      ? value / 12.92
      : Math.pow((value + 0.055) / 1.055, 2.4);
  });

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(foreground: string, background: string) {
  const foregroundColor = parseCssColor(foreground);
  const backgroundColor = parseCssColor(background);

  if (!foregroundColor || !backgroundColor) {
    return 1;
  }

  const foregroundLuminance = relativeLuminance(foregroundColor);
  const backgroundLuminance = relativeLuminance(backgroundColor);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);

  return (lighter + 0.05) / (darker + 0.05);
}

export function contrastRating(
  foreground: string,
  background: string,
  isLargeText = false,
): ContrastRating {
  const ratio = contrastRatio(foreground, background);
  const requiredRatio = isLargeText ? 3 : 4.5;

  return {
    ratio,
    requiredRatio,
    aa: ratio >= requiredRatio,
    aaa: ratio >= (isLargeText ? 4.5 : 7),
  };
}

export function formatContrastRatio(ratio: number) {
  return ratio.toFixed(2);
}
