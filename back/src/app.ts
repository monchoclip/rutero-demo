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
import { WhatsAppRepository } from "./whatsapp/WhatsAppRepository.js";
import { WhatsAppService } from "./whatsapp/WhatsAppService.js";
import { whatsAppHandlers } from "./whatsapp/handlers/index.js";
import { metaTransport } from "./whatsapp/MetaTransport.js";
import type { WhatsAppTransport } from "./whatsapp/WhatsAppTypes.js";
import { EventHub } from "./realtime/EventHub.js";
import { CatalogRepository } from "./catalog/CatalogRepository.js";
import { CatalogService } from "./catalog/CatalogService.js";
import { catalogHandlers } from "./catalog/handlers.js";
import { OrderRepository } from "./orders/OrderRepository.js";
import { OrderService } from "./orders/OrderService.js";
import { orderHandlers } from "./orders/handlers.js";
import {
  createVisitPhotoStorage,
  visitPhotoStorageConfigFromEnv,
  type VisitPhotoStorage,
} from "./storage/VisitPhotoStorage.js";
export async function createApp(
  db: PrismaClient,
  options: {
    origin: string;
    production: boolean;
    localMail: boolean;
    metaWebhookVerifyToken?: string;
    metaAppSecret?: string;
    wompiPublicKey?: string;
    wompiIntegritySecret?: string;
    wompiEventsSecret?: string;
    trustProxy?: boolean | string;
    whatsappTransport?: WhatsAppTransport;
    visitPhotoStorage?: VisitPhotoStorage;
  },
) {
  const app = Fastify({
    logger: {
      redact: ["req.headers.cookie", "req.headers.authorization"],
      level: process.env.LOG_LEVEL ?? "warn",
    },
    bodyLimit: 3 * 1024 * 1024,
    trustProxy: options.trustProxy ?? false,
  });
  // JSON bodies are parsed as usual, but the raw string is kept on the
  // request too: Meta's webhook signature is an HMAC over the exact raw
  // bytes, which a re-serialized JSON.stringify(parsed) would not match.
  app.addContentTypeParser(
    "application/json",
    { parseAs: "string" },
    (request, body, done) => {
      request.rawBody = body as string;
      if (!body) return done(null, {});
      try {
        done(null, JSON.parse(body as string));
      } catch (error) {
        done(error as Error, undefined);
      }
    },
  );
  await app.register(cookie);
  await app.register(cors, {
    origin: options.origin,
    credentials: true,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "X-Ruts68-Request"],
  });
  await app.register(helmet);
  app.decorateRequest("actor", null);
  const identity = new IdentityService(new IdentityRepository(db));
  const realtime = new EventHub();
  const catalog = new CatalogService(new CatalogRepository(db), realtime);
  const orders = new OrderService(new OrderRepository(db), undefined, realtime);
  const visitPhotoStorage =
    options.visitPhotoStorage ??
    createVisitPhotoStorage(visitPhotoStorageConfigFromEnv());
  const services = {
    identity,
    crm: new CrmService(
      new CrmRepository(db),
      options.origin,
      realtime,
      visitPhotoStorage,
    ),
    realtime,
    catalog,
    ...options,
  };
  const billing = new BillingService(
    new BillingRepository(db),
    !options.production && options.localMail,
    {
      origin: options.origin,
      wompiPublicKey: options.wompiPublicKey,
      wompiIntegritySecret: options.wompiIntegritySecret,
      wompiEventsSecret: options.wompiEventsSecret,
    },
    realtime,
  );
  const whatsapp = new WhatsAppService(
    new WhatsAppRepository(db),
    options.whatsappTransport ?? metaTransport,
    options.metaAppSecret,
    realtime,
  );
  const handlers = {
    ...identityHandlers(services),
    ...crmHandlers(services),
    ...billingHandlers(billing),
    ...whatsAppHandlers(whatsapp, options.metaWebhookVerifyToken),
    ...catalogHandlers(catalog),
    ...orderHandlers(orders),
  };
  app.get("/health", async () => ({ status: "ok" }));
  for (const [method, url, operation, protectedRoute, external] of routes) {
    app.route({
      method,
      url,
      preHandler: async (request) => {
        // External routes are called by Meta, not the browser: no same-
        // origin cookie, no custom header, no login-attempt rate limit.
        // Their own signature verification is the real gate.
        if (external) return;
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
        if (operation === "realtimeEvents") return result;
        if (external) return result;
        const meta = {
          requestId: request.id,
          timestamp: new Date().toISOString(),
        };
        return ["clients", "activities", "auditEvents"].includes(operation)
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
  app.addHook("onClose", async () => {
    realtime.close();
  });
  return app;
}
