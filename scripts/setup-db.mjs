import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

function readDatabaseUrl() {
  // When Turso is configured for production, skip local SQLite setup.
  if (process.env.TURSO_DATABASE_URL) {
    console.log("Turso database configured — skipping local SQLite setup.");
    return null;
  }

  const envPath = path.join(process.cwd(), ".env");
  if (existsSync(envPath)) {
    const env = readFileSync(envPath, "utf8");
    for (const line of env.split(/\r?\n/)) {
      const match = line.match(/^\s*DATABASE_URL\s*=\s*(.+?)\s*$/);
      if (match) {
        return match[1].replace(/^['"]|['"]$/g, "");
      }
    }
  }

  return process.env.DATABASE_URL ?? "file:C:/tmp/accessready-dev.db";
}

function sqlitePathFromUrl(databaseUrl) {
  if (!databaseUrl.startsWith("file:")) {
    throw new Error("DATABASE_URL must be a SQLite file: URL.");
  }

  const rawPath = databaseUrl.slice("file:".length);
  if (path.win32.isAbsolute(rawPath) || path.posix.isAbsolute(rawPath)) {
    return rawPath;
  }

  return path.resolve(process.cwd(), rawPath);
}

const databaseUrl = readDatabaseUrl();
if (databaseUrl === null) {
  process.exit(0); // Turso mode — nothing to set up locally.
}

const databasePath = sqlitePathFromUrl(databaseUrl);
mkdirSync(path.dirname(databasePath), { recursive: true });

const db = new DatabaseSync(databasePath);
db.exec(`
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
  "html" TEXT NOT NULL,
  "failureSummary" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Violation_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "PageResult" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "Scan_createdAt_idx" ON "Scan"("createdAt");
CREATE INDEX IF NOT EXISTS "PageResult_scanId_idx" ON "PageResult"("scanId");
CREATE INDEX IF NOT EXISTS "Violation_pageId_idx" ON "Violation"("pageId");
`);

const violationColumns = db
  .prepare('PRAGMA table_info("Violation")')
  .all()
  .map((column) => column.name);

const scanColumns = db
  .prepare('PRAGMA table_info("Scan")')
  .all()
  .map((column) => column.name);

if (!scanColumns.includes("source")) {
  db.exec('ALTER TABLE "Scan" ADD COLUMN "source" TEXT NOT NULL DEFAULT \'url\';');
}

if (!scanColumns.includes("productType")) {
  db.exec('ALTER TABLE "Scan" ADD COLUMN "productType" TEXT;');
}

if (!scanColumns.includes("productTypeOther")) {
  db.exec('ALTER TABLE "Scan" ADD COLUMN "productTypeOther" TEXT;');
}

if (!scanColumns.includes("targetMarket")) {
  db.exec('ALTER TABLE "Scan" ADD COLUMN "targetMarket" TEXT;');
}

if (!scanColumns.includes("targetMarketOther")) {
  db.exec('ALTER TABLE "Scan" ADD COLUMN "targetMarketOther" TEXT;');
}

if (!scanColumns.includes("notes")) {
  db.exec('ALTER TABLE "Scan" ADD COLUMN "notes" TEXT;');
}

if (!scanColumns.includes("industry")) {
  db.exec('ALTER TABLE "Scan" ADD COLUMN "industry" TEXT;');
}

if (!scanColumns.includes("industryOther")) {
  db.exec('ALTER TABLE "Scan" ADD COLUMN "industryOther" TEXT;');
}

if (!scanColumns.includes("applicableRegulations")) {
  db.exec('ALTER TABLE "Scan" ADD COLUMN "applicableRegulations" TEXT;');
}

if (!violationColumns.includes("boundingBoxJson")) {
  db.exec('ALTER TABLE "Violation" ADD COLUMN "boundingBoxJson" TEXT;');
}

if (!violationColumns.includes("colorDataJson")) {
  db.exec('ALTER TABLE "Violation" ADD COLUMN "colorDataJson" TEXT;');
}

if (!violationColumns.includes("section")) {
  db.exec('ALTER TABLE "Violation" ADD COLUMN "section" TEXT;');
}


if (!violationColumns.includes("heroAnalysisJson")) {
  db.exec('ALTER TABLE "Violation" ADD COLUMN "heroAnalysisJson" TEXT;');
}
db.close();

console.log(`SQLite database ready at ${databasePath}`);
