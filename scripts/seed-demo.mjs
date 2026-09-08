import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
const { password, whatsappTokenKey } = JSON.parse(
  readFileSync(".local/database.json", "utf8"),
);
const env = {
  ...process.env,
  NODE_ENV: "development",
  DATABASE_URL: `postgresql://ruts68:${password}@127.0.0.1:55468/ruts68`,
  WHATSAPP_TOKEN_ENCRYPTION_KEY: whatsappTokenKey,
};
async function run(args) {
  const child = spawn(process.execPath, [process.env.npm_execpath, ...args], {
    env,
    stdio: "inherit",
    windowsHide: true,
  });
  const code = await new Promise((resolve) => child.on("exit", resolve));
  if (code !== 0) throw new Error("Demo setup failed");
}
await run(["run", "db:migrate", "-w", "back"]);
await run(["exec", "-w", "back", "--", "tsx", "scripts/seed-demo.ts"]);
