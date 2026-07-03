import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

function createClient(): PrismaClient {
  // Turso/libsql remote database (production / Vercel).
  // Guard against unset or placeholder env vars — both must be real strings.
  const tursoUrl = process.env.TURSO_DATABASE_URL;
  const tursoToken = process.env.TURSO_AUTH_TOKEN;

  if (
    tursoUrl &&
    tursoUrl.startsWith("libsql://") &&
    tursoToken &&
    tursoToken !== "undefined"
  ) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { PrismaLibSQL } = require("@prisma/adapter-libsql");
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { createClient: createLibSQL } = require("@libsql/client");

    const libsql = createLibSQL({
      url: tursoUrl,
      authToken: tursoToken,
    });

    return new PrismaClient({ adapter: new PrismaLibSQL(libsql) });
  }

  // Local SQLite file (development)
  return new PrismaClient();
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
