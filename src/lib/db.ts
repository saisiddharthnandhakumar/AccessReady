import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

function createClient(): PrismaClient {
  // Turso/libsql remote database (production / Vercel)
  if (process.env.TURSO_DATABASE_URL) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { PrismaLibSQL } = require("@prisma/adapter-libsql");
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { createClient: createLibSQL } = require("@libsql/client");

    const libsql = createLibSQL({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN,
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
