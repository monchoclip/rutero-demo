import awsLambdaFastify from "@fastify/aws-lambda";
import { PrismaClient } from "@prisma/client";
import { getConfig } from "./config/env.js";
import { createApp } from "./app.js";
// Runtime injects configuration before module loading. Only SDK/database clients are cached.
const config = getConfig();
const app = await createApp(new PrismaClient(), {
  ...config,
  localMail: false,
});
export const handler = awsLambdaFastify(app);
await app.ready();
