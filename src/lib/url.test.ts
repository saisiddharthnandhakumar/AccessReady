import { describe, expect, it } from "vitest";
import { isSameOrigin, normalizeUrl, shouldSkipCrawlUrl } from "@/lib/url";

describe("url utilities", () => {
  it("normalizes http and https URLs", () => {
    expect(normalizeUrl(" HTTPS://Example.COM/docs/#intro ")).toBe(
      "https://example.com/docs",
    );
  });

  it("rejects non-web protocols", () => {
    expect(() => normalizeUrl("ftp://example.com")).toThrow(
      "Only http and https URLs can be scanned.",
    );
  });

  it("checks same origin", () => {
    expect(isSameOrigin("https://example.com/a", "https://example.com/b")).toBe(
      true,
    );
    expect(
      isSameOrigin("https://docs.example.com/a", "https://example.com/b"),
    ).toBe(false);
  });

  it("skips downloads and non-web links", () => {
    expect(shouldSkipCrawlUrl("https://example.com/report.pdf")).toBe(true);
    expect(shouldSkipCrawlUrl("mailto:hello@example.com")).toBe(true);
    expect(shouldSkipCrawlUrl("https://example.com/about")).toBe(false);
  });
});
