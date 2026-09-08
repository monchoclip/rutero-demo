import { readFileSync, writeFileSync } from "node:fs";
import { routes } from "../src/routes.js";
const result =
  JSON.stringify(
    routes.map(([method, path, operation, authenticated]) => ({
      method,
      path,
      operation,
      authenticated,
      entry: "src/lambda.entry.ts",
    })),
    null,
    2,
  ) + "\n";
if (process.argv.includes("--check")) {
  if (readFileSync("routes.manifest.json", "utf8") !== result)
    throw new Error("Run npm run routes:generate");
} else writeFileSync("routes.manifest.json", result);
