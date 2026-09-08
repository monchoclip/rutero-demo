import { PrismaClient } from "@prisma/client";
import { seedDemo } from "../src/development/seed.js";
const url = new URL(process.env.DATABASE_URL ?? "");
if (
  process.env.NODE_ENV === "production" ||
  !["localhost", "127.0.0.1"].includes(url.hostname) ||
  !["/ruts68", "/ruts68_test"].includes(url.pathname)
)
  throw new Error(
    "Demo seed is restricted to the local development/test database",
  );
const db = new PrismaClient();
try {
  console.log(JSON.stringify(await seedDemo(db), null, 2));
} finally {
  await db.$disconnect();
}
