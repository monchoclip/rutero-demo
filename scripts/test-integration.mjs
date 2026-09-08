import { readFileSync, existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { startDatabase } from "./database.mjs";
let owned;
let databaseUrl = process.env.TEST_DATABASE_URL;
let whatsappTokenKey = process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY;
if (!databaseUrl) {
  if (existsSync(".local/postgres/postmaster.pid")) {
    const config = JSON.parse(readFileSync(".local/database.json", "utf8"));
    databaseUrl = `postgresql://ruts68:${config.password}@127.0.0.1:55468/ruts68_test`;
    whatsappTokenKey ??= config.whatsappTokenKey;
  } else {
    const started = await startDatabase();
    owned = started.database;
    databaseUrl = started.url.replace(/\/ruts68$/, "/ruts68_test");
    whatsappTokenKey ??= started.whatsappTokenKey;
  }
}
if (new URL(databaseUrl).pathname !== "/ruts68_test")
  throw new Error("Integration tests require a database named ruts68_test");
const env = {
  ...process.env,
  DATABASE_URL: databaseUrl,
  TEST_DATABASE_URL: databaseUrl,
  WHATSAPP_TOKEN_ENCRYPTION_KEY: whatsappTokenKey,
  LOG_LEVEL: "silent",
};
function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [process.env.npm_execpath, ...args], {
      env,
      stdio: "inherit",
      windowsHide: true,
    });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`Command failed (${code})`)),
    );
  });
}
try {
  if (!existsSync("node_modules/.prisma/client/index.js"))
    await run(["run", "db:generate", "-w", "back"]);
  await run(["run", "db:migrate", "-w", "back"]);
  await run(["run", "test:integration", "-w", "back"]);
} finally {
  if (owned) await owned.stop();
}
