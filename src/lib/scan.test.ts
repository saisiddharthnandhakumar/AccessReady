import { describe, expect, it } from "vitest";
import { DEFAULT_MAX_DEPTH, DEFAULT_MAX_PAGES } from "@/lib/scan-options";

describe("scan defaults", () => {
  it("audits only the provided URL page by default", () => {
    expect(DEFAULT_MAX_PAGES).toBe(1);
    expect(DEFAULT_MAX_DEPTH).toBe(0);
  });
});
