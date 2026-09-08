import EmbeddedPostgres from "embedded-postgres";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomBytes } from "node:crypto";
export async function startDatabase() {
  const directory = resolve(".local");
  mkdirSync(directory, { recursive: true });
  const configFile = resolve(directory, "database.json");
  if (!existsSync(configFile))
    writeFileSync(
      configFile,
      JSON.stringify({ password: randomBytes(24).toString("hex") }),
    );
  const { password } = JSON.parse(readFileSync(configFile, "utf8"));
  const databaseDir = resolve(directory, "postgres");
  const database = new EmbeddedPostgres({
    databaseDir,
    user: "ruts68",
    password,
    port: 55468,
    persistent: true,
    postgresFlags: ["-h", "127.0.0.1"],
    onLog: () => {},
    onError: (message) => {
      if (String(message).includes("FATAL")) console.error(String(message));
    },
  });
  if (!existsSync(resolve(databaseDir, "PG_VERSION")))
    await database.initialise();
  await database.start();
  const client = database.getPgClient();
  await client.connect();
  for (const name of ["ruts68", "ruts68_test"]) {
    const result = await client.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [name],
    );
    if (!result.rowCount) await client.query(`CREATE DATABASE ${name}`);
  }
  await client.end();
  return {
    database,
    url: `postgresql://ruts68:${password}@127.0.0.1:55468/ruts68`,
  };
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === resolve("scripts/database.mjs")
) {
  const { database } = await startDatabase();
  console.log(
    "PostgreSQL local listo en 127.0.0.1:55468. Credenciales en .local/database.json (ignoradas por Git).",
  );
  for (const signal of ["SIGINT", "SIGTERM"])
    process.on(signal, async () => {
      await database.stop();
      process.exit(0);
    });
  setInterval(() => {}, 60000);
}
