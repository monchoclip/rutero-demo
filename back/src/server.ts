import { PrismaClient } from "@prisma/client";
import { createApp } from "./app.js";
import { getConfig } from "./config/env.js";
const config = getConfig();
const db = new PrismaClient();
const app = await createApp(db, {
  ...config,
  localMail: config.mailTransport === "local",
});
await app.listen({ port: config.port, host: "127.0.0.1" });
console.log(`Ruts68 API: http://localhost:${config.port}`);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, async () => {
    await app.close();
    await db.$disconnect();
    process.exit(0);
  });
