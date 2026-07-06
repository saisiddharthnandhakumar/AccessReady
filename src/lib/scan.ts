import "server-only";

import { chromium, type Page } from "playwright-core";
import { readFile } from "node:fs/promises";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { enqueueLinks, type QueueItem } from "@/lib/crawl";
import {
  contrastRatio,
  normalizeHexColor,
  type ColorData,
} from "@/lib/contrast";
import { DEFAULT_MAX_DEPTH, DEFAULT_MAX_PAGES, SCROLL_SETTINGS } from "@/lib/scan-options";
import { normalizeUrl } from "@/lib/url";
import { type ScanMetadataInput } from "@/lib/scan-metadata";
import {
  getApplicableRegulations,
} from "@/lib/compliance";
import { buildSectionClassificationScript } from "@/lib/page-sections";
import { analyzeHeroSection } from "@/lib/hero-detection";
import { analyzeImageWithVision } from "@/lib/vision-analysis";
import { postProcessVisionResult } from "@/lib/vision-postprocess";

export { DEFAULT_MAX_DEPTH, DEFAULT_MAX_PAGES } from "@/lib/scan-options";

let axeSourceCache: string | null = null;

type AxeViolation = {
  id: string;
  impact?: string;
  description: string;
  help: string;
  helpUrl: string;
  tags: string[];
  nodes: Array<{
    html: string;
    target: string[];
    any: Array<{ data?: unknown }>;
    all: Array<{ data?: unknown }>;
    none: Array<{ data?: unknown }>;
    failureSummary?: string;
  }>;
};

type AxeRunResult = {
  violations: AxeViolation[];
};

type ElementBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type CrawlOptions = {
  maxPages?: number;
  maxDepth?: number;
};

function publicScreenshotPath(fileName: string) {
  return `/audit-screenshots/${fileName}`;
}

function publicImageUploadPath(fileName: string) {
  return `/image-uploads/${fileName}`;
}

async function imageUploadDirectory() {
  const directory = path.join(process.cwd(), "public", "image-uploads");
  await mkdir(directory, { recursive: true });
  return directory;
}

/**
 * Saves a base64-encoded image to the public/image-uploads/ directory.
 * Returns the public URL path for serving the image.
 */
async function saveCapturedImage(
  base64: string,
  mimeType: string,
): Promise<string> {
  const dir = await imageUploadDirectory();
  const ext = mimeType === "image/jpeg" ? ".jpg"
    : mimeType === "image/webp" ? ".webp"
    : mimeType === "image/gif" ? ".gif"
    : ".png";
  const fileName = `${randomUUID()}${ext}`;
  const filePath = path.join(dir, fileName);
  const buffer = Buffer.from(base64, "base64");
  await writeFile(filePath, buffer);
  return publicImageUploadPath(fileName);
}

function colorDataFromAxeNode(node: AxeViolation["nodes"][number]): ColorData | null {
  const checks = [...node.any, ...node.all, ...node.none];

  for (const check of checks) {
    const data = check.data;
    if (!data || typeof data !== "object") {
      continue;
    }

    const record = data as Record<string, unknown>;
    const foreground = normalizeHexColor(
      String(record.fgColor ?? record.foreground ?? record.color ?? ""),
    );
    const background = normalizeHexColor(
      String(record.bgColor ?? record.background ?? record.backgroundColor ?? ""),
    );

    if (!foreground || !background) {
      continue;
    }

    const rawRatio =
      typeof record.contrastRatio === "number"
        ? record.contrastRatio
        : Number(record.contrastRatio);

    return {
      foreground,
      background,
      contrastRatio: Number.isFinite(rawRatio)
        ? rawRatio
        : contrastRatio(foreground, background),
      sampleText: node.html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim(),
      source: "axe",
    };
  }

  return null;
}

async function screenshotDirectory() {
  const directory = path.join(process.cwd(), "public", "audit-screenshots");
  await mkdir(directory, { recursive: true });
  return directory;
}

async function extractLinks(page: Page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]"))
      .map((anchor) => anchor.href)
      .filter(Boolean),
  );
}

async function runAxe(page: Page): Promise<AxeRunResult> {
  axeSourceCache ??= await readFile(
    path.join(process.cwd(), "node_modules", "axe-core", "axe.min.js"),
    "utf8",
  );
  await page.addScriptTag({ content: axeSourceCache });
  return page.evaluate(async () => {
    const axeInstance = window.axe;
    if (!axeInstance) {
      throw new Error("axe-core did not load in the audited page.");
    }

    return axeInstance.run(document, {
      runOnly: {
        type: "rule",
        values: ["color-contrast"],
      },
      resultTypes: ["violations"],
    });
  });
}

async function pageTitle(page: Page) {
  try {
    return await page.title();
  } catch {
    return null;
  }
}

async function elementBoxForTarget(
  page: Page,
  target: string[],
): Promise<ElementBox | null> {
  return page.evaluate((selectors) => {
    for (let index = selectors.length - 1; index >= 0; index -= 1) {
      try {
        const element = document.querySelector(selectors[index]);
        if (!element) {
          continue;
        }

        const rect = element.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) {
          continue;
        }

        return {
          x: rect.left + window.scrollX,
          y: rect.top + window.scrollY,
          width: rect.width,
          height: rect.height,
        };
      } catch {
        continue;
      }
    }

    return null;
  }, target);
}

/**
 * Scrolls through the page in increments to trigger lazy-loaded content
 * (IntersectionObserver, scroll-based animations, infinite scroll placeholders).
 * After scrolling to the bottom, scrolls back to top for the screenshot.
 */
async function scrollToTriggerLazyContent(page: Page): Promise<void> {
  const startTime = Date.now();
  let previousHeight = 0;

  try {
    // Dispatch scroll & resize events up front to wake lazy observers
    await page.evaluate(() => {
      window.dispatchEvent(new Event("scroll"));
      window.dispatchEvent(new Event("resize"));
    });

    while (Date.now() - startTime < SCROLL_SETTINGS.MAX_SCROLL_TIME_MS) {
      const currentHeight = await page.evaluate(() => document.body.scrollHeight);

      // Scroll one step down
      await page.evaluate((step) => {
        window.scrollBy({ top: step, behavior: "instant" });
      }, SCROLL_SETTINGS.SCROLL_STEP_PX);

      await page.waitForTimeout(SCROLL_SETTINGS.SCROLL_DELAY_MS);

      // Check if new content loaded
      const newHeight = await page.evaluate(() => document.body.scrollHeight);

      if (newHeight > currentHeight) {
        // New content appeared — wait for it to render
        await page.waitForTimeout(SCROLL_SETTINGS.LAZY_LOAD_WAIT_MS);
        // Dispatch events again in case more lazy observers are waiting
        await page.evaluate(() => {
          window.dispatchEvent(new Event("scroll"));
          window.dispatchEvent(new Event("resize"));
        });
      }

      // Stop if we've reached the bottom and no new content
      const scrollY = await page.evaluate(() => window.scrollY);
      const bottomReached =
        scrollY + (await page.evaluate(() => window.innerHeight)) >=
        await page.evaluate(() => document.body.scrollHeight);

      if (bottomReached && newHeight <= previousHeight) {
        break;
      }

      previousHeight = newHeight;
    }
  } catch {
    // Scroll errors are non-fatal — the scan continues with whatever content is visible
  }

  // Scroll back to top for the full-page screenshot
  await page.evaluate(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  });
  await page.waitForTimeout(200);
}

// ── Image extraction and vision analysis ──

type PageImageDescriptor = {
  imageUrl: string;
  imageType: "img" | "css-background";
  altText: string | null;
};

/** Maximum number of images to analyze per page via the vision model. */
const MAX_IMAGES_PER_PAGE = 3;

/** Image URLs matching these patterns are skipped (tracking, icons, etc.). */
const SKIP_IMAGE_PATTERNS = [
  /\/pixel\b/i,
  /\/tracking\b/i,
  /\/spacer\b/i,
  /\/1x1\b/i,
  /\/blank\b/i,
  /\/clear\b/i,
  /\/dot\b/i,
  /\/icon-/i,
  /\/favicon/i,
  /data:image\/svg/i,
];

function shouldSkipImage(url: string): boolean {
  if (!url) return true;
  // Skip data URIs except raster image data URIs
  if (url.startsWith("data:") && !url.startsWith("data:image/png") && !url.startsWith("data:image/jpeg") && !url.startsWith("data:image/webp")) return true;
  // Skip very short data URIs (likely tiny icons)
  if (url.startsWith("data:") && url.length < 500) return true;
  // Skip known tracking/icon patterns
  for (const pattern of SKIP_IMAGE_PATTERNS) {
    if (pattern.test(url)) return true;
  }
  return false;
}

/**
 * Extracts discoverable images from the current page.
 * Runs in the browser context via page.evaluate().
 */
async function extractPageImages(page: Page): Promise<PageImageDescriptor[]> {
  const images = await page.evaluate((maxImages) => {
    const images: Array<{ imageUrl: string; imageType: string; altText: string | null }> = [];
    const seen = new Set<string>();
    const baseUrl = document.baseURI || window.location.href;

    function resolveUrl(src: string): string {
      try {
        return new URL(src, baseUrl).href;
      } catch {
        return src;
      }
    }

    // Collect <img> elements
    const imgElements = document.querySelectorAll<HTMLImageElement>("img[src]");
    for (const img of imgElements) {
      if (images.length >= maxImages) break;

      const src = img.src?.trim();
      if (!src || seen.has(src)) continue;

      const rect = img.getBoundingClientRect();
      // Skip images smaller than 50x50px (likely icons, spacers)
      if (rect.width < 50 && rect.height < 50) continue;
      // Skip hidden images
      if (rect.width === 0 || rect.height === 0) continue;

      seen.add(src);
      images.push({
        imageUrl: src,
        imageType: "img",
        altText: img.alt?.trim() || null,
      });
    }

    // Collect CSS background-images on prominent elements
    if (images.length < maxImages) {
      const bgCandidates = document.querySelectorAll(
        "section, header, footer, div[class*='hero'], div[class*='banner'], " +
        "div[class*='bg'], div[class*='background'], div[style*='background']",
      );

      for (const el of bgCandidates) {
        if (images.length >= maxImages) break;
        if (!(el instanceof HTMLElement)) continue;

        const bgImage = window.getComputedStyle(el).backgroundImage;
        if (!bgImage || bgImage === "none") continue;

        // Extract URL from CSS url() syntax
        const urlMatch = bgImage.match(/url\(["']?([^"')]+)["']?\)/);
        if (!urlMatch?.[1]) continue;

        const resolved = resolveUrl(urlMatch[1]);
        if (seen.has(resolved)) continue;

        const rect = el.getBoundingClientRect();
        if (rect.width < 100 || rect.height < 100) continue;

        seen.add(resolved);
        images.push({
          imageUrl: resolved,
          imageType: "css-background",
          altText: null,
        });
      }
    }

    return images;
  }, MAX_IMAGES_PER_PAGE);

  return images as PageImageDescriptor[];
}

/**
 * Captures a single image from the page as a base64 data URI.
 * Tries direct fetch first (fast, preserves original quality),
 * falls back to Playwright element screenshot (handles CORS).
 */
async function captureImageBase64(
  page: Page,
  imageUrl: string,
  imageType: "img" | "css-background",
): Promise<{ base64: string; mimeType: string } | null> {
  // Strategy 1: Try to fetch the image directly from the page context
  try {
    const fetched = await page.evaluate(async (url) => {
      try {
        const response = await fetch(url, { mode: "cors" });
        if (!response.ok || !response.body) return null;
        const blob = await response.blob();
        if (blob.size === 0 || blob.size > 10 * 1024 * 1024) return null; // skip empty or >10MB

        return new Promise<string | null>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => resolve(null);
          reader.readAsDataURL(blob);
        });
      } catch {
        return null; // CORS or network error — will fall back to screenshot
      }
    }, imageUrl);

    if (fetched) {
      // Parse the data URI to extract base64 and mime type
      // Match any image/* MIME type: png, jpeg, webp, gif, etc.
      const match = fetched.match(/^data:(image\/[^;]+);base64,([\s\S]+)$/);
      if (match) {
        return { mimeType: match[1], base64: match[2] };
      }
      // Fallback: try to extract just the base64 part after the comma
      const fallbackMatch = fetched.match(/^data:[^;]*;base64,([\s\S]+)$/);
      if (fallbackMatch) {
        // Guess mime type from the image URL extension
        const lower = imageUrl.toLowerCase();
        const guessedType = lower.endsWith(".webp") ? "image/webp"
          : lower.endsWith(".jpg") || lower.endsWith(".jpeg") ? "image/jpeg"
          : lower.endsWith(".png") ? "image/png"
          : lower.endsWith(".gif") ? "image/gif"
          : "image/png";
        return { mimeType: guessedType, base64: fallbackMatch[1] };
      }
    }
  } catch {
    // Fetch failed — fall through to element screenshot
  }

  // Strategy 2: Screenshot the image element (handles cross-origin images)
  try {
    if (imageType === "img") {
      // Locate the img element by src
      const imgElement = page.locator(`img[src="${imageUrl}"]`).first();
      const count = await imgElement.count();
      if (count > 0) {
        const screenshot = await imgElement.screenshot({ type: "png", timeout: 10000 });
        return {
          base64: Buffer.from(screenshot).toString("base64"),
          mimeType: "image/png",
        };
      }
    }

    // For CSS backgrounds, try to find the element with that background
    const bgElement = page.locator(`[style*="background"]`).first();
    const count = await bgElement.count();
    if (count > 0) {
      const screenshot = await bgElement.screenshot({ type: "png", timeout: 10000 });
      return {
        base64: Buffer.from(screenshot).toString("base64"),
        mimeType: "image/png",
      };
    }
  } catch {
    // Screenshot failed
  }

  return null;
}

/**
 * Phase 1: Captures images from a page while it's still open, saves them
 * to disk, and creates ImageAnalysis records with status "pending".
 * Returns the IDs of records that need deferred AI analysis.
 *
 * This runs fast (< 10s) and does NOT call the NVIDIA API.
 */
async function capturePageImages(
  page: Page,
  pageResultId: string,
): Promise<string[]> {
  const descriptors = await extractPageImages(page);
  if (descriptors.length === 0) return [];

  const filtered = descriptors.filter((d) => !shouldSkipImage(d.imageUrl));
  const analysisIds: string[] = [];

  for (const descriptor of filtered) {
    try {
      const captured = await captureImageBase64(page, descriptor.imageUrl, descriptor.imageType);
      if (!captured) {
        await prisma.imageAnalysis.create({
          data: {
            pageId: pageResultId,
            imageUrl: descriptor.imageUrl.slice(0, 2000),
            imageType: descriptor.imageType,
            altText: descriptor.altText,
            status: "failed",
            error: "Could not capture image (CORS or element not found).",
          },
        });
        continue;
      }

      const storedPath = await saveCapturedImage(captured.base64, captured.mimeType);

      const record = await prisma.imageAnalysis.create({
        data: {
          pageId: pageResultId,
          imageUrl: descriptor.imageUrl.slice(0, 2000),
          imageType: descriptor.imageType,
          altText: descriptor.altText,
          mimeType: captured.mimeType,
          storedPath,
          status: "pending", // will be analyzed in Phase 2
        },
      });
      analysisIds.push(record.id);
    } catch (err) {
      console.warn(
        `Image capture failed for "${descriptor.imageUrl.slice(0, 100)}":`,
        err instanceof Error ? err.message : err,
      );
      try {
        await prisma.imageAnalysis.create({
          data: {
            pageId: pageResultId,
            imageUrl: descriptor.imageUrl.slice(0, 2000),
            imageType: descriptor.imageType,
            altText: descriptor.altText,
            status: "failed",
            error: err instanceof Error ? err.message : "Image capture failed.",
          },
        });
      } catch {
        // DB write failed — nothing more we can do
      }
    }
  }

  return analysisIds;
}

/**
 * Phase 2: Runs NVIDIA vision analysis on a previously captured image.
 * Reads the image back from disk, sends it to the vision model,
 * post-processes the result, and updates the ImageAnalysis record.
 *
 * Called AFTER the scan is marked "completed" so slow API calls
 * don't block the core audit results from being saved.
 */
async function runDeferredImageAnalysis(analysisId: string): Promise<void> {
  const record = await prisma.imageAnalysis.findUnique({
    where: { id: analysisId },
  });

  if (!record || !record.storedPath || !record.mimeType) {
    await prisma.imageAnalysis.update({
      where: { id: analysisId },
      data: { status: "failed", error: "Captured image not found for deferred analysis." },
    }).catch(() => {});
    return;
  }

  const fullPath = path.join(process.cwd(), "public", record.storedPath);

  let base64: string;
  try {
    const buffer = await readFile(fullPath);
    base64 = buffer.toString("base64");
  } catch {
    await prisma.imageAnalysis.update({
      where: { id: analysisId },
      data: { status: "failed", error: "Could not read captured image from disk." },
    }).catch(() => {});
    return;
  }

  try {
    const { result: rawResult, rawResponse } = await analyzeImageWithVision(
      base64,
      record.mimeType,
    );

    const corrected = postProcessVisionResult(rawResult);

    const status = corrected.hasText ? "completed" : "skipped";

    await prisma.imageAnalysis.update({
      where: { id: analysisId },
      data: {
        status,
        resultJson: JSON.stringify(corrected),
        rawResponse: rawResponse.slice(0, 10000),
      },
    });
  } catch (err) {
    console.warn(
      `Vision analysis failed for image ${analysisId}:`,
      err instanceof Error ? err.message : err,
    );
    await prisma.imageAnalysis.update({
      where: { id: analysisId },
      data: {
        status: "failed",
        error: err instanceof Error ? err.message : "Vision analysis failed.",
      },
    }).catch(() => {});
  }
}

export async function runContrastScan(
  inputUrl: string,
  options: CrawlOptions = {},
  metadata?: ScanMetadataInput,
  /** When provided, update this existing scan instead of creating a new record. */
  existingScanId?: string,
) {
  const normalizedUrl = normalizeUrl(inputUrl);
  const maxPages = options.maxPages ?? DEFAULT_MAX_PAGES;
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;

  let scanId: string;

  if (existingScanId) {
    scanId = existingScanId;
  } else {
    const regulations =
      metadata?.targetMarket && metadata?.industry
        ? getApplicableRegulations(
            metadata.targetMarket,
            metadata.industry,
          )
        : [];

    const scan = await prisma.scan.create({
      data: {
        url: inputUrl.trim(),
        normalizedUrl,
        status: "running",
        productType: metadata?.productType ?? null,
        productTypeOther: metadata?.productTypeOther ?? null,
        targetMarket: metadata?.targetMarket ?? null,
        targetMarketOther: metadata?.targetMarketOther ?? null,
        industry: metadata?.industry ?? null,
        industryOther: metadata?.industryOther ?? null,
        applicableRegulations:
          regulations.length > 0 ? JSON.stringify(regulations) : null,
        notes: metadata?.notes ?? null,
      },
    });
    scanId = scan.id;
  }

  // Connect to remote browser (Browserless.io or custom CDP endpoint) in
  // production / serverless, or launch a local Chromium in development.
  const wsEndpoint = process.env.BROWSERLESS_WS_ENDPOINT;
  const apiKey = process.env.BROWSERLESS_API_KEY;
  const remoteEndpoint =
    (wsEndpoint && wsEndpoint.startsWith("wss://") ? wsEndpoint : null) ??
    (apiKey && apiKey !== "undefined"
      ? `wss://chrome.browserless.io?token=${apiKey}`
      : null);

  if (!remoteEndpoint) {
    // In serverless environments (Vercel, AWS Lambda, etc.) there is no
    // Chromium installed — a remote browser service is required.
    throw new Error(
      "No remote browser configured. Set BROWSERLESS_API_KEY or " +
      "BROWSERLESS_WS_ENDPOINT in your environment variables. " +
      "Sign up for a free Browserless account at https://browserless.io " +
      "(1,000 sessions/month free).",
    );
  }

  const browser = await chromium.connect({
    wsEndpoint: remoteEndpoint,
    timeout: 30000, // 30s to establish the WebSocket connection
  });
  const context = await browser.newContext({
    viewport: { width: 1366, height: 900 },
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    bypassCSP: true,
    ignoreHTTPSErrors: true,
  });

  const queue: QueueItem[] = [{ url: normalizedUrl, depth: 0 }];
  const seen = new Set([normalizedUrl]);
  let auditedPages = 0;
  let totalViolations = 0;
  const allPendingImageIds: string[] = [];

  try {
    const screenshotRoot = await screenshotDirectory();

    while (queue.length > 0 && auditedPages < maxPages) {
      const item = queue.shift();
      if (!item) {
        continue;
      }

      const page = await context.newPage();

      try {
        let response = await page.goto(item.url, {
          waitUntil: "domcontentloaded",
          timeout: 25000,
        }).catch(async (err) => {
          // Some sites (IRCTC, government portals) reject headless browsers
          // with HTTP/2 protocol errors. Retry once with a longer timeout
          // and "load" waitUntil as a fallback.
          if (err instanceof Error && err.message.includes("ERR_HTTP2_PROTOCOL_ERROR")) {
            return page.goto(item.url, {
              waitUntil: "load",
              timeout: 30000,
            });
          }
          throw err;
        });

        const statusCode = response?.status();
        const contentType = response?.headers()["content-type"] ?? "";
        if (!response || !contentType.toLowerCase().includes("text/html")) {
          await page.close();
          continue;
        }

        await page.waitForLoadState("networkidle", { timeout: 7000 }).catch(() => {
          // Some pages keep analytics or sockets open. DOM-ready is enough for contrast checks.
        });

        // Scroll through the page to trigger lazy-loaded content
        await scrollToTriggerLazyContent(page);

        if (maxDepth > 0 && maxPages > 1) {
          const links = await extractLinks(page);
          enqueueLinks(queue, seen, links, normalizedUrl, item.depth, maxDepth);
        }

        const results = await runAxe(page);
        const fileName = `${scanId}-${auditedPages + 1}.png`;
        await page.screenshot({
          path: path.join(screenshotRoot, fileName),
          fullPage: true,
          timeout: 30000, // 30s max for full-page screenshot
        });

        // Collect all violation targets for batched section classification
        const allNodes = results.violations.flatMap((v) =>
          v.nodes.map((n) => ({ node: n, violation: v })),
        );

        const allTargets = allNodes.map(({ node }) => node.target);

        // Batch-classify all sections in one page.evaluate call
        const sectionScript = buildSectionClassificationScript(allTargets);
        const sections: string[] = await page.evaluate(sectionScript);

        // For hero-classified violations, run hero detection analysis
        const heroIndices: number[] = [];
        for (let i = 0; i < sections.length; i++) {
          if (sections[i] === "hero") {
            heroIndices.push(i);
          }
        }

        const heroAnalyses: (string | null)[] = new Array(allNodes.length).fill(null);

        if (heroIndices.length > 0) {
          // Inject the hero analysis function into the page context
          const heroFnBody = analyzeHeroSection.toString();

          for (const idx of heroIndices) {
            const { node } = allNodes[idx];
            const colorData = colorDataFromAxeNode(node);
            const fg = colorData?.foreground ?? "#000000";
            const bg = colorData?.background ?? "#FFFFFF";

            try {
              const analysis = await page.evaluate(
                ({ heroFn, selector, fgColor, bgColor }) => {
                  // Reconstruct the function from its string representation
                  const analyzeFn = new Function(
                    "selector",
                    "foregroundColor",
                    "backgroundColor",
                    `return (${heroFn})(selector, foregroundColor, backgroundColor);`,
                  );
                  const result = analyzeFn(selector, fgColor, bgColor);
                  return result ? JSON.stringify(result) : null;
                },
                {
                  heroFn: heroFnBody,
                  selector: node.target,
                  fgColor: fg,
                  bgColor: bg,
                },
              );
              heroAnalyses[idx] = analysis;
            } catch {
              // Hero analysis is non-critical — continue without it
            }
          }
        }

        const violations = await Promise.all(
          allNodes.map(async ({ node, violation }, index) => {
            const boundingBox = await elementBoxForTarget(page, node.target);
            const colorData = colorDataFromAxeNode(node);

            return {
              axeId: violation.id,
              impact: violation.impact ?? null,
              description: violation.description,
              help: violation.help,
              helpUrl: violation.helpUrl,
              tagsJson: JSON.stringify(violation.tags),
              targetJson: JSON.stringify(node.target),
              boundingBoxJson: boundingBox ? JSON.stringify(boundingBox) : null,
              colorDataJson: colorData ? JSON.stringify(colorData) : null,
              section: sections[index] ?? "unknown",
              heroAnalysisJson: heroAnalyses[index],
              html: node.html.slice(0, 2000),
              failureSummary: node.failureSummary?.slice(0, 4000) ?? null,
            };
          }),
        );

        const pageResult = await prisma.pageResult.create({
          data: {
            scanId: scanId,
            url: item.url,
            title: await pageTitle(page),
            depth: item.depth,
            statusCode,
            screenshotPath: publicScreenshotPath(fileName),
            violationCount: violations.length,
            violations: {
              create: violations,
            },
          },
        });

        // Phase 1: Capture images while page is still open (fast, < 10s).
        // Deferred AI analysis happens in Phase 2 after scan is completed.
        let pendingImageIds: string[] = [];
        if (process.env.NVIDIA_API_KEY) {
          try {
            pendingImageIds = await capturePageImages(page, pageResult.id);
            allPendingImageIds.push(...pendingImageIds);
          } catch (err) {
            console.warn(
              `Image capture failed for ${item.url}:`,
              err instanceof Error ? err.message : err,
            );
          }
        }

        auditedPages += 1;
        totalViolations += violations.length;
      } finally {
        if (!page.isClosed()) {
          await page.close();
        }
      }
    }

    const completedScan = await prisma.scan.update({
      where: { id: scanId },
      data: {
        status: "completed",
        pageCount: auditedPages,
        violationCount: totalViolations,
        finishedAt: new Date(),
      },
    });

    // Phase 2: Deferred image analysis — runs AFTER scan is marked complete.
    // NVIDIA API calls are slow; they must not block the core audit results.
    if (allPendingImageIds.length > 0) {
      // Limit total image analysis to 60s to avoid Vercel timeout.
      const analysisPromise = Promise.all(
        allPendingImageIds.map((id) => runDeferredImageAnalysis(id)),
      );
      await Promise.race([
        analysisPromise,
        new Promise<void>((resolve) => setTimeout(resolve, 60000)),
      ]).catch((err) => {
        console.warn(
          "Deferred image analysis incomplete:",
          err instanceof Error ? err.message : err,
        );
      });
    }

    return completedScan;
  } catch (error) {
    await prisma.scan.update({
      where: { id: scanId },
      data: {
        status: "failed",
        error: error instanceof Error ? error.message : "Unexpected scan failure.",
        pageCount: auditedPages,
        violationCount: totalViolations,
        finishedAt: new Date(),
      },
    });
    throw error;
  } finally {
    await context.close();
    await browser.close();
  }
}
