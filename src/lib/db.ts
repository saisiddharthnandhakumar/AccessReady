import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

/**
 * Returns true when the value looks like a well-formed Turso database URL.
 * Rejects placeholder strings ("undefined", "null"), protocol-only URLs, and
 * any URL whose hostname is missing or is itself a placeholder.
 */
function isValidTursoUrl(value: string): boolean {
  if (!value || value === "undefined" || value === "null") {
    return false;
  }
  if (!value.startsWith("libsql://")) {
    return false;
  }
  try {
    const parsed = new URL(value);
    if (
      !parsed.hostname ||
      parsed.hostname === "undefined" ||
      parsed.hostname === "null"
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function isValidTursoToken(value: string): boolean {
  return Boolean(value) && value !== "undefined" && value !== "null";
}

/**
 * Creates the PrismaClient — either Turso-backed (production) or local SQLite.
 * Only called lazily on first property access of the exported proxy, never at
 * module evaluation time, so the query engine is never initialized during build.
 */
function createClient(): PrismaClient {
  const tursoUrl = process.env.TURSO_DATABASE_URL ?? "";
  const tursoToken = process.env.TURSO_AUTH_TOKEN ?? "";

  if (isValidTursoUrl(tursoUrl) && isValidTursoToken(tursoToken)) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { PrismaLibSQL } = require("@prisma/adapter-libsql");
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { createClient: createLibSQL } = require("@libsql/client");

      const libsql = createLibSQL({
        url: tursoUrl,
        authToken: tursoToken,
      });

      return new PrismaClient({ adapter: new PrismaLibSQL(libsql) });
    } catch (error) {
      console.warn(
        "Turso client creation failed — falling back to local SQLite.",
        error instanceof Error ? error.message : error,
      );
    }
  }

  // Local SQLite file (development / build-time fallback).
  // Prisma 6 uses @libsql/client as its default SQLite driver internally.
  // Set DATABASE_URL in process.env directly because the generated Prisma
  // client reads from the environment and throws LibsqlError on undefined.
  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = "file:./accessready-dev.db";
  }
  return new PrismaClient();
}

function getClient(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createClient();
  }
  return globalForPrisma.prisma;
}

/**
 * Lazy PrismaClient proxy.
 *
 * The real client is NOT created when this module is imported — only when
 * a property is first accessed (e.g. `prisma.scan.findMany()`).  This
 * guarantees that the query engine (and @libsql/client) are never loaded
 * during `next build`, avoiding LibsqlError crashes when DATABASE_URL
 * and TURSO_* env vars are not available at build time.
 */
export const prisma = new Proxy({} as PrismaClient, {
  get(_, prop: string | symbol) {
    const client = getClient();
    const value = (client as unknown as Record<string | symbol, unknown>)[prop];
    if (typeof value === "function") {
      return value.bind(client);
    }
    return value;
  },
}) as PrismaClient;
