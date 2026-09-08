import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
const { password } = JSON.parse(readFileSync(".local/database.json", "utf8"));
const child = spawn(
  process.execPath,
  [process.env.npm_execpath, "run", "reminders", "-w", "back"],
  {
    stdio: "inherit",
    windowsHide: true,
    env: {
      ...process.env,
      NODE_ENV: "development",
      MAIL_TRANSPORT: "local",
      DATABASE_URL: `postgresql://ruts68:${password}@127.0.0.1:55468/ruts68`,
    },
  },
);
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
