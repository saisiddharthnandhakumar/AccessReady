import { mkdir } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { chromium } from "playwright-core";
import { z } from "zod";
import { normalizeHexColor } from "@/lib/contrast";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 120;

const previewRequestSchema = z.object({
  pageId: z.string().min(1),
  violationId: z.string().min(1),
  foreground: z.string().min(1),
  background: z.string().min(1),
});

function publicPreviewPath(fileName: string) {
  return `/audit-previews/${fileName}`;
}

async function previewDirectory() {
  const directory = path.join(process.cwd(), "public", "audit-previews");
  await mkdir(directory, { recursive: true });
  return directory;
}

function parseSelectors(targetJson: string) {
  try {
    const targets = JSON.parse(targetJson);
    return Array.isArray(targets)
      ? targets.filter((target) => typeof target === "string")
      : [];
  } catch {
    return [];
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = previewRequestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid preview request." },
      { status: 400 },
    );
  }

  const foreground = normalizeHexColor(parsed.data.foreground);
  const background = normalizeHexColor(parsed.data.background);

  if (!foreground || !background) {
    return NextResponse.json(
      { error: "Choose valid foreground and background colors." },
      { status: 400 },
    );
  }

  const scan = await prisma.scan.findUnique({
    where: { id },
    include: {
      pages: {
        where: { id: parsed.data.pageId },
        include: {
          violations: {
            where: { id: parsed.data.violationId },
          },
        },
      },
    },
  });

  const pageResult = scan?.pages[0];
  const violation = pageResult?.violations[0];

  if (!scan || !pageResult || !violation) {
    return NextResponse.json({ error: "Preview target not found." }, { status: 404 });
  }

  if (scan.source !== "url") {
    return NextResponse.json(
      { error: "Live rerender previews are only available for URL scans." },
      { status: 400 },
    );
  }

  const selectors = parseSelectors(violation.targetJson);
  if (selectors.length === 0) {
    return NextResponse.json(
      { error: "This finding does not have a restylable selector." },
      { status: 400 },
    );
  }

  // Connect to remote browser (Browserless) in production, local in dev.
  const wsEndpoint = process.env.BROWSERLESS_WS_ENDPOINT;
  const apiKey = process.env.BROWSERLESS_API_KEY;
  const remoteEndpoint =
    (wsEndpoint && wsEndpoint.startsWith("wss://") ? wsEndpoint : null) ??
    (apiKey && apiKey !== "undefined"
      ? `wss://chrome.browserless.io?token=${apiKey}`
      : null);

  const browser = remoteEndpoint
    ? await chromium.connect({ wsEndpoint: remoteEndpoint })
    : await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1366, height: 900 },
    userAgent:
      "AccessReady Contrast Auditor/0.1 (+https://localhost; Playwright)",
  });

  try {
    await page.goto(pageResult.url, {
      waitUntil: "domcontentloaded",
      timeout: 25000,
    });
    await page.waitForLoadState("networkidle", { timeout: 7000 }).catch(() => {
      // DOM-ready is sufficient for a preview when a site keeps sockets open.
    });

    const applied = await page.evaluate(
      ({ selectorList, foregroundColor, backgroundColor }) => {
        for (let index = selectorList.length - 1; index >= 0; index -= 1) {
          try {
            const element = document.querySelector<HTMLElement>(selectorList[index]);
            if (!element) {
              continue;
            }

            element.style.setProperty("color", foregroundColor, "important");
            element.style.setProperty(
              "background-color",
              backgroundColor,
              "important",
            );
            return true;
          } catch {
            continue;
          }
        }

        return false;
      },
      {
        selectorList: selectors,
        foregroundColor: foreground,
        backgroundColor: background,
      },
    );

    if (!applied) {
      return NextResponse.json(
        { error: "The selected element could not be found on rerender." },
        { status: 404 },
      );
    }

    const previewRoot = await previewDirectory();
    const fileName = `${id}-${parsed.data.violationId}-${Date.now()}.png`;
    await page.screenshot({
      path: path.join(previewRoot, fileName),
      fullPage: true,
    });

    return NextResponse.json({ previewPath: publicPreviewPath(fileName) });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "The preview could not be generated.",
      },
      { status: 500 },
    );
  } finally {
    await page.close();
    await browser.close();
  }
}
