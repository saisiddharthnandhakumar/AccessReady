-- Initial SQLite schema for Accessibility Contrast Auditor.
-- The app uses Prisma Client for persistence. A setup script applies this
-- schema because Prisma's schema engine fails without diagnostics on this
-- Windows workspace.

CREATE TABLE IF NOT EXISTS "Scan" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "url" TEXT NOT NULL,
  "normalizedUrl" TEXT NOT NULL,
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
  "html" TEXT NOT NULL,
  "failureSummary" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Violation_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "PageResult" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "Scan_createdAt_idx" ON "Scan"("createdAt");
CREATE INDEX IF NOT EXISTS "PageResult_scanId_idx" ON "PageResult"("scanId");
CREATE INDEX IF NOT EXISTS "Violation_pageId_idx" ON "Violation"("pageId");
