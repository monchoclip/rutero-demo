import Fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import { Prisma, type PrismaClient } from "@prisma/client";
import { ZodError } from "zod";
import { IdentityRepository } from "./identity/IdentityRepository.js";
import { IdentityService } from "./identity/IdentityService.js";
import { CrmRepository } from "./crm/CrmRepository.js";
import { CrmService } from "./crm/CrmService.js";
import { identityHandlers } from "./identity/handlers/index.js";
import { crmHandlers } from "./crm/handlers/index.js";
import { cookieName } from "./shared/context.js";
import { AppError } from "./shared/errors.js";
import { routes } from "./routes.js";
import { BillingRepository } from "./billing/BillingRepository.js";
import { BillingService } from "./billing/BillingService.js";
import { billingHandlers } from "./billing/handlers/index.js";
export async function createApp(
  db: PrismaClient,
  options: { origin: string; production: boolean; localMail: boolean },
) {
  const app = Fastify({
    logger: {
      redact: ["req.headers.cookie", "req.headers.authorization"],
      level: process.env.LOG_LEVEL ?? "warn",
    },
    bodyLimit: 65536,
    trustProxy: false,
  });
  await app.register(cookie);
  await app.register(cors, {
    origin: options.origin,
    credentials: true,
    methods: ["GET", "POST", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "X-Ruts68-Request"],
  });
  await app.register(helmet);
  app.decorateRequest("actor", null);
  const identity = new IdentityService(new IdentityRepository(db));
  const services = {
    identity,
    crm: new CrmService(new CrmRepository(db), options.origin),
    ...options,
  };
  const billing = new BillingService(
    new BillingRepository(db),
    !options.production && options.localMail,
  );
  const handlers = {
    ...identityHandlers(services),
    ...crmHandlers(services),
    ...billingHandlers(billing),
  };
  app.get("/health", async () => ({ status: "ok" }));
  for (const [method, url, operation, protectedRoute] of routes) {
    app.route({
      method,
      url,
      preHandler: async (request) => {
        if (
          method !== "GET" &&
          (request.headers.origin !== options.origin ||
            request.headers["x-ruts68-request"] !== "1")
        )
          throw new AppError(403, "INVALID_ORIGIN", "Solicitud no autorizada.");
        if (protectedRoute)
          request.actor = await identity.authenticate(
            request.cookies[cookieName],
          );
        else await identity.limit(`ip:${request.ip}`);
      },
      handler: async (request, reply) => {
        const result = await handlers[operation](request, reply);
        const meta = {
          requestId: request.id,
          timestamp: new Date().toISOString(),
        };
        return operation === "clients"
          ? { ...(result as object), meta }
          : { data: result, meta };
      },
    });
  }
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError)
      return reply.code(400).send({
        error: "VALIDATION_ERROR",
        message: "Revisa los datos del formulario.",
        details: error.flatten(),
        requestId: request.id,
      });
    if (error instanceof AppError)
      return reply.code(error.statusCode).send({
        error: error.code,
        message: error.message,
        requestId: request.id,
      });
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    )
      return reply.code(409).send({
        error: "CONFLICT",
        message:
          "El registro ya existe. Actualiza la página antes de volver a intentarlo.",
        requestId: request.id,
      });
    request.log.error({ err: error, requestId: request.id }, "Request failed");
    return reply.code(500).send({
      error: "INTERNAL_SERVER_ERROR",
      message: "No pudimos completar la operación. Intenta de nuevo.",
      requestId: request.id,
    });
  });
  return app;
}
