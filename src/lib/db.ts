import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// In Next.js, we instantiate the adapter only on the server side
let prisma: PrismaClient;

if (typeof window === "undefined") {
  const adapter = new PrismaBetterSqlite3({
    url: "file:./dev.db",
  });
  prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = prisma;
  }
} else {
  prisma = null as unknown as PrismaClient;
}

export { prisma };
