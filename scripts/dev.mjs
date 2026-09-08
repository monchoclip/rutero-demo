import { spawn } from "node:child_process";
import { startDatabase } from "./database.mjs";
const { database, url, whatsappTokenKey } = await startDatabase();
const npmCli = process.env.npm_execpath;
const env = {
  ...process.env,
  DATABASE_URL: url,
  APP_ORIGIN: "http://localhost:3068",
  NEXT_PUBLIC_API_URL: "http://localhost:4068",
  MAIL_TRANSPORT: "local",
  WHATSAPP_TOKEN_ENCRYPTION_KEY: whatsappTokenKey,
};
function run(args, extra = {}) {
  return spawn(process.execPath, [npmCli, ...args], {
    stdio: "inherit",
    env,
    windowsHide: true,
    ...extra,
  });
}
async function command(args) {
  const child = run(args);
  const code = await new Promise((resolve) => child.on("exit", resolve));
  if (code !== 0) throw new Error("Setup failed");
}
await command(["run", "db:generate", "-w", "back"]);
await command(["run", "db:migrate", "-w", "back"]);
const children = [
  run(["run", "dev", "-w", "back"]),
  run(["run", "dev", "-w", "front"]),
];
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill();
  await database.stop();
  process.exit(0);
}
for (const child of children) child.on("exit", stop);
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, stop);
