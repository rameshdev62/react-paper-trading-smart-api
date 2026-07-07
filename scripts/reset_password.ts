import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../src/generated/prisma/client";
import bcrypt from "bcryptjs";

const adapter = new PrismaBetterSqlite3({
  url: "file:./dev.db",
});

const prisma = new PrismaClient({ adapter });

async function main() {
  const email = "ramesh.dev062@gmail.com";
  const password = "password123";
  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.update({
    where: { email },
    data: { passwordHash },
  });
  console.log("Password reset successfully for", email);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
