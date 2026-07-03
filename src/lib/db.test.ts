import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";

const createdScanIds: string[] = [];

describe("scan persistence", () => {
  afterAll(async () => {
    await prisma.scan.deleteMany({
      where: { id: { in: createdScanIds } },
    });
    await prisma.$disconnect();
  });

  it("persists scans, pages, and violations", async () => {
    const scan = await prisma.scan.create({
      data: {
        url: "https://example.com",
        normalizedUrl: "https://example.com/",
        status: "completed",
        pageCount: 1,
        violationCount: 1,
        finishedAt: new Date(),
        pages: {
          create: {
            url: "https://example.com/",
            depth: 0,
            statusCode: 200,
            violationCount: 1,
            violations: {
              create: {
                axeId: "color-contrast",
                impact: "serious",
                description: "Elements must meet contrast requirements.",
                help: "Elements must meet minimum color contrast ratio thresholds",
                helpUrl: "https://dequeuniversity.com/rules/axe/4.12/color-contrast",
                tagsJson: JSON.stringify(["wcag2aa"]),
                targetJson: JSON.stringify([".low-contrast"]),
                html: "<p class=\"low-contrast\">Text</p>",
                failureSummary: "Fix contrast.",
              },
            },
          },
        },
      },
      include: { pages: { include: { violations: true } } },
    });

    createdScanIds.push(scan.id);

    expect(scan.pages).toHaveLength(1);
    expect(scan.pages[0]?.violations).toHaveLength(1);
    expect(scan.violationCount).toBe(1);
  });

  it("persists scan metadata fields", async () => {
    const scan = await prisma.scan.create({
      data: {
        url: "https://example.com/products",
        normalizedUrl: "https://example.com/products",
        productType: "E-commerce Checkout",
        productTypeOther: null,
        targetMarket: "United States",
        targetMarketOther: null,
        notes: "Checkout flow for accessibility review",
        status: "completed",
      },
    });

    createdScanIds.push(scan.id);

    expect(scan.productType).toBe("E-commerce Checkout");
    expect(scan.targetMarket).toBe("United States");
    expect(scan.notes).toBe("Checkout flow for accessibility review");
  });

  it("persists Other custom values for product type and target market", async () => {
    const scan = await prisma.scan.create({
      data: {
        url: "https://example.com/internal",
        normalizedUrl: "https://example.com/internal",
        productType: "Internal Admin Panel",
        productTypeOther: "Internal Admin Panel",
        targetMarket: "World Bank",
        targetMarketOther: "World Bank",
        notes: null,
        status: "completed",
      },
    });

    createdScanIds.push(scan.id);

    expect(scan.productType).toBe("Internal Admin Panel");
    expect(scan.productTypeOther).toBe("Internal Admin Panel");
    expect(scan.targetMarket).toBe("World Bank");
    expect(scan.targetMarketOther).toBe("World Bank");
    expect(scan.notes).toBeNull();
  });
});
