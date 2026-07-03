// Push tables to Turso database. Run with:
//   node scripts/setup-turso.mjs

import { createClient } from "@libsql/client";

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url || !authToken) {
  console.error("TURSO_DATABASE_URL and TURSO_AUTH_TOKEN must be set.");
  process.exit(1);
}

const db = createClient({ url, authToken });

const sql = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS "Scan" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "url" TEXT NOT NULL,
  "normalizedUrl" TEXT NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'url',
  "productType" TEXT,
  "productTypeOther" TEXT,
  "targetMarket" TEXT,
  "targetMarketOther" TEXT,
  "industry" TEXT,
  "industryOther" TEXT,
  "applicableRegulations" TEXT,
  "notes" TEXT,
  "status" TEXT NOT NULL DEFAULT 'running',
  "pageCount" INTEGER NOT NULL DEFAULT 0,
  "violationCount" INTEGER NOT NULL DEFAULT 0,
  "error" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" DATETIME
);

CREATE TABLE IF NOT EXISTS "PageResult" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "scanId" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "title" TEXT,
  "depth" INTEGER NOT NULL,
  "statusCode" INTEGER,
  "screenshotPath" TEXT,
  "violationCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PageResult_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "Scan" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "Violation" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "pageId" TEXT NOT NULL,
  "axeId" TEXT NOT NULL,
  "impact" TEXT,
  "description" TEXT NOT NULL,
  "help" TEXT NOT NULL,
  "helpUrl" TEXT NOT NULL,
  "tagsJson" TEXT NOT NULL,
  "targetJson" TEXT NOT NULL,
  "boundingBoxJson" TEXT,
  "colorDataJson" TEXT,
  "section" TEXT,
  "heroAnalysisJson" TEXT,
  "html" TEXT NOT NULL,
  "failureSummary" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Violation_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "PageResult" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "ImageAnalysis" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "pageId" TEXT NOT NULL,
  "imageUrl" TEXT NOT NULL,
  "imageType" TEXT NOT NULL DEFAULT 'img',
  "altText" TEXT,
  "mimeType" TEXT,
  "storedPath" TEXT,
  "status" TEXT NOT NULL DEFAULT 'completed',
  "error" TEXT,
  "resultJson" TEXT,
  "rawResponse" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ImageAnalysis_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "PageResult" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "Scan_createdAt_idx" ON "Scan"("createdAt");
CREATE INDEX IF NOT EXISTS "PageResult_scanId_idx" ON "PageResult"("scanId");
CREATE INDEX IF NOT EXISTS "Violation_pageId_idx" ON "Violation"("pageId");
CREATE INDEX IF NOT EXISTS "ImageAnalysis_pageId_idx" ON "ImageAnalysis"("pageId");
`;

// Execute each statement separately
for (const stmt of sql.split(";")) {
  const trimmed = stmt.trim();
  if (trimmed) {
    try {
      await db.execute(trimmed + ";");
    } catch (err) {
      if (err.message?.includes("already exists") || err.message?.includes("duplicate")) {
        // ignore
      } else {
        console.error("Error:", err.message);
        console.error("Statement:", trimmed.slice(0, 80) + "...");
      }
    }
  }
}

console.log("Turso database tables created successfully.");
process.exit(0);
