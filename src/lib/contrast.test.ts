import { describe, expect, it } from "vitest";
import {
  COLOR_BLIND_FILTERS,
  contrastRating,
  contrastRatio,
  normalizeHexColor,
  relativeLuminance,
} from "@/lib/contrast";

describe("contrast utilities", () => {
  it("normalizes hex and rgb color values", () => {
    expect(normalizeHexColor("#fff")).toBe("#FFFFFF");
    expect(normalizeHexColor("rgb(31, 179, 174)")).toBe("#1FB3AE");
    expect(normalizeHexColor("not-a-color")).toBeNull();
  });

  it("calculates relative luminance and contrast ratio", () => {
    expect(relativeLuminance({ r: 0, g: 0, b: 0 })).toBe(0);
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 2);
    expect(contrastRatio("#1FB3AE", "#FFFFFF")).toBeCloseTo(2.59, 1);
  });

  it("labels AA and AAA contrast outcomes", () => {
    expect(contrastRating("#000000", "#FFFFFF")).toMatchObject({
      aa: true,
      aaa: true,
      requiredRatio: 4.5,
    });
    expect(contrastRating("#777777", "#FFFFFF")).toMatchObject({
      aa: false,
      aaa: false,
      requiredRatio: 4.5,
    });
  });

  it("defines deterministic color blind preview filters", () => {
    expect(COLOR_BLIND_FILTERS.normal).toBe("none");
    expect(COLOR_BLIND_FILTERS.protanopia).toContain("protanopia");
    expect(COLOR_BLIND_FILTERS.deuteranopia).toContain("deuteranopia");
    expect(COLOR_BLIND_FILTERS.tritanopia).toContain("tritanopia");
    expect(COLOR_BLIND_FILTERS.grayscale).toBe("grayscale(1)");
  });
});
