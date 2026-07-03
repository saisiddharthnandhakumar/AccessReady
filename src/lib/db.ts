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

function createClient(): PrismaClient {
  // Turso/libsql remote database (production / Vercel).
  // Guard against unset or placeholder env vars — both must be real strings.
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

  // Local SQLite file (development)
  return new PrismaClient();
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
