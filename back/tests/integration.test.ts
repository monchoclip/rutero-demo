import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { PrismaClient } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { createApp } from "../src/app.js";
import { NotificationService } from "../src/notifications/NotificationService.js";
import { NotificationRepository } from "../src/notifications/NotificationRepository.js";
import { seedDemo, DEMO_PASSWORD } from "../src/development/seed.js";
import { DEMO_ORGANIZATION_ID } from "../src/billing/BillingTypes.js";
import { hashPassword } from "../src/shared/security.js";
import { createHash, createHmac } from "node:crypto";
import type { WhatsAppTransport } from "../src/whatsapp/WhatsAppTypes.js";
const url = process.env.TEST_DATABASE_URL;
if (!url || new URL(url).pathname !== "/ruts68_test")
  throw new Error("Use npm run test:integration from the project root");
const db = new PrismaClient({ datasources: { db: { url } } });
const origin = "http://localhost:3068";
let app: FastifyInstance;
let owner: { cookie: string; id: string; organizationId: string };
let other: typeof owner;
let advisor: { cookie: string; id: string };
let secondAdvisor: typeof advisor;
let externalAdvisor: typeof advisor;
let clientId: string;
let activityId: string;
const suffix = crypto.randomUUID();
const password = "Testing-only-password-123!";
const remoteAddress = `2001:db8:${suffix.slice(0, 4)}:${suffix.slice(4, 8)}::1`;
async function request(
  method: "GET" | "POST" | "PATCH",
  path: string,
  body?: unknown,
  cookie = "",
  address = remoteAddress,
) {
  return app.inject({
    method,
    url: path,
    remoteAddress: address,
    headers: { origin, "x-ruts68-request": "1", cookie },
    ...(body === undefined ? {} : { payload: body as Record<string, unknown> }),
  });
}
function session(response: Awaited<ReturnType<typeof request>>) {
  return String(response.headers["set-cookie"]).split(";")[0];
}
async function register(prefix: string) {
  const response = await request("POST", "/auth/register", {
    name: `Coordinador ${prefix}`,
    companyName: `Empresa ${prefix}`,
    sector: "commerce",
    email: `${prefix}-${suffix}@example.test`,
    password,
  });
  expect(response.statusCode).toBe(201);
  const data = response.json().data;
  return {
    cookie: session(response),
    id: data.id as string,
    organizationId: data.organizationId as string,
  };
}
async function invite(coordinator: typeof owner, name: string) {
  const email = `${name}-${suffix}@example.test`.toLowerCase();
  const response = await request(
    "POST",
    "/invitations",
    { name, email },
    coordinator.cookie,
  );
  expect(response.statusCode).toBe(201);
  const mail = await db.emailJob.findFirstOrThrow({
    where: { organizationId: coordinator.organizationId, recipient: email },
  });
  const token = mail.body.match(/invitation=([a-f0-9]{64})/)?.[1];
  expect(token).toBeTruthy();
  const accepted = await request("POST", "/auth/accept-invitation", {
    token,
    password,
  });
  expect(accepted.statusCode).toBe(200);
  expect(
    (await request("POST", "/auth/accept-invitation", { token, password }))
      .statusCode,
  ).toBe(410);
  return { cookie: session(accepted), id: accepted.json().data.id as string };
}
beforeAll(async () => {
  app = await createApp(db, {
    origin,
    production: false,
    localMail: true,
    wompiEventsSecret: "wompi-events-test-secret",
  });
  owner = await register("alpha");
  other = await register("beta");
  advisor = await invite(owner, "Ana");
  secondAdvisor = await invite(owner, "Luis");
  externalAdvisor = await invite(other, "Maria");
}, 30000);
afterAll(async () => {
  await app?.close();
  await db.$disconnect();
});
describe.sequential("real PostgreSQL CRM flow", () => {
  it("creates a company with its coordinator and a persisted calendar-month trial", async () => {
    const result = await request(
      "GET",
      "/organization",
      undefined,
      owner.cookie,
    );
    expect(result.statusCode).toBe(200);
    const org = result.json().data;
    expect(org.id).toBe(owner.organizationId);
    expect(new Date(org.trialEndsAt).getTime()).toBeGreaterThan(
      Date.now() + 27 * 86400000,
    );
    expect(
      (await request("GET", "/auth/me", undefined, owner.cookie)).json().data,
    ).not.toHaveProperty("passwordHash");
  });
  it("lets a newly registered company associate a local payment with its session", async () => {
    const checkout = await request(
      "POST",
      "/billing/checkout",
      {
        planId: "essential",
        users: 2,
        customerName: "Coordinador alpha",
        customerEmail: `alpha-${suffix}@example.test`,
      },
      owner.cookie,
    );
    expect(checkout.statusCode).toBe(201);
    const data = checkout.json().data;
    expect(data.mode).toBe("simulation");
    const simulation = await request(
      "POST",
      "/billing/simulations",
      {
        planId: "essential",
        users: 2,
        expectedVersion: data.quote.version,
        outcome: "approved",
        reference: data.reference,
        idempotencyKey: crypto.randomUUID(),
      },
      owner.cookie,
    );
    expect(simulation.statusCode).toBe(201);
    const updated = await db.organization.findUniqueOrThrow({
      where: { id: owner.organizationId },
    });
    expect(updated.membershipPlan).toBe("essential");
    expect(updated.membershipStatus).toBe("active");
  });
  it("rejects unauthenticated requests, bad origins and role escalation", async () => {
    expect((await request("GET", "/clients")).statusCode).toBe(401);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/auth/login",
          payload: { email: "a@example.test", password },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await request(
          "POST",
          "/invitations",
          { name: "Otro", email: "other@example.test" },
          advisor.cookie,
        )
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await request("POST", "/auth/register", {
          name: "Xx",
          companyName: "Yy",
          sector: "commerce",
          email: `bad-${suffix}@example.test`,
          password,
          role: "super_admin",
        })
      ).statusCode,
    ).toBe(400);
  });
  it("creates a client only for an active adviser in the same company", async () => {
    const data = {
      name: "Colegio Horizonte",
      contactName: "Laura Peña",
      email: "laura@example.test",
      phone: "3001234567",
      city: "Bogotá",
      advisorId: advisor.id,
      notes: "Admisiones",
    };
    expect(
      (
        await request(
          "POST",
          "/clients",
          { ...data, advisorId: externalAdvisor.id },
          owner.cookie,
        )
      ).statusCode,
    ).toBe(422);
    const created = await request("POST", "/clients", data, owner.cookie);
    expect(created.statusCode).toBe(201);
    clientId = created.json().data.id;
    expect(
      (await request("GET", "/clients", undefined, advisor.cookie))
        .json()
        .data.map((c: { id: string }) => c.id),
    ).toContain(clientId);
    expect(
      (await request("GET", "/clients", undefined, secondAdvisor.cookie)).json()
        .data,
    ).toEqual([]);
    expect(
      (
        await request(
          "GET",
          `/clients/${clientId}/history`,
          undefined,
          other.cookie,
        )
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await request(
          "GET",
          `/clients/${clientId}/history`,
          undefined,
          secondAdvisor.cookie,
        )
      ).statusCode,
    ).toBe(404);
  });
  it("schedules a call and a durable reminder without duplicate activities on retry", async () => {
    const data = {
      clientId,
      type: "call",
      dueAt: new Date(Date.now() + 3600000).toISOString(),
      notes: "Consultar interés en matrícula",
      idempotencyKey: crypto.randomUUID(),
    };
    const created = await request("POST", "/activities", data, advisor.cookie);
    expect(created.statusCode).toBe(201);
    activityId = created.json().data.id;
    expect(
      (await request("POST", "/activities", data, advisor.cookie)).json().data
        .id,
    ).toBe(activityId);
    expect(
      (
        await request(
          "POST",
          "/activities",
          { ...data, notes: "Otra intención" },
          advisor.cookie,
        )
      ).statusCode,
    ).toBe(409);
    expect(await db.emailJob.count({ where: { activityId } })).toBe(1);
    expect(
      (
        await request(
          "POST",
          "/activities",
          { ...data, idempotencyKey: crypto.randomUUID() },
          externalAdvisor.cookie,
        )
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await request(
          "POST",
          `/activities/${activityId}/complete`,
          { outcome: "contacted", notes: "Intento ajeno", durationSeconds: 10 },
          secondAdvisor.cookie,
        )
      ).statusCode,
    ).toBe(404);
  });
  it("completes a call and atomically schedules exactly one follow-up even on concurrent retries", async () => {
    const data = {
      outcome: "interested",
      notes: "Solicita propuesta para la próxima semana",
      durationSeconds: 120,
      followUpAt: new Date(Date.now() + 7200000).toISOString(),
    };
    const responses = await Promise.all([
      request(
        "POST",
        `/activities/${activityId}/complete`,
        data,
        advisor.cookie,
      ),
      request(
        "POST",
        `/activities/${activityId}/complete`,
        data,
        advisor.cookie,
      ),
    ]);
    expect(responses.map((r) => r.statusCode)).toEqual([200, 200]);
    expect(
      await db.activity.count({
        where: {
          organizationId: owner.organizationId,
          idempotencyKey: `follow-up:${activityId}`,
        },
      }),
    ).toBe(1);
    expect(
      (await db.emailJob.findUniqueOrThrow({ where: { activityId } }))
        .cancelledAt,
    ).not.toBeNull();
  });
  it("captures visit start location, closing location and photo before completion", async () => {
    const scheduled = await request(
      "POST",
      "/activities",
      {
        clientId,
        type: "visit",
        dueAt: new Date(Date.now() + 3600000).toISOString(),
        notes: "Visita de seguimiento con rectoría",
        idempotencyKey: crypto.randomUUID(),
      },
      advisor.cookie,
    );
    expect(scheduled.statusCode).toBe(201);
    const visitId = scheduled.json().data.id as string;
    expect(
      (
        await request(
          "POST",
          `/activities/${visitId}/complete`,
          {
            outcome: "contacted",
            notes: "Sin evidencia",
            durationSeconds: 600,
          },
          advisor.cookie,
        )
      ).statusCode,
    ).toBe(422);
    expect(
      (
        await request(
          "POST",
          `/activities/${visitId}/start-visit`,
          {
            latitude: 4.71098,
            longitude: -74.07209,
            accuracy: 12,
            capturedAt: new Date().toISOString(),
            address: "Bogotá",
          },
          secondAdvisor.cookie,
        )
      ).statusCode,
    ).toBe(404);
    const startedAt = new Date().toISOString();
    const started = await request(
      "POST",
      `/activities/${visitId}/start-visit`,
      {
        latitude: 4.71098,
        longitude: -74.07209,
        accuracy: 12,
        capturedAt: startedAt,
        address: "Bogotá",
      },
      advisor.cookie,
    );
    expect(started.statusCode).toBe(200);
    expect(started.json().data.visitStartLatitude).toBe(4.71098);
    const closed = await request(
      "POST",
      `/activities/${visitId}/complete`,
      {
        outcome: "contacted",
        notes: "Pedido levantado en sitio",
        durationSeconds: 900,
        visitEvidence: {
          start: {
            latitude: 4.71098,
            longitude: -74.07209,
            accuracy: 12,
            capturedAt: startedAt,
            address: "Bogotá",
          },
          end: {
            latitude: 4.711,
            longitude: -74.072,
            accuracy: 14,
            capturedAt: new Date().toISOString(),
          },
          photoDataUrl: "data:image/jpeg;base64,aGVsbG8=",
        },
      },
      advisor.cookie,
    );
    expect(closed.statusCode).toBe(200);
    const visit = closed.json().data;
    expect(visit.status).toBe("completed");
    expect(visit.visitPhotoDataUrl).toContain("data:image/jpeg;base64");
    expect(visit.visitDistanceMeters).toBeLessThan(20);
  });
  it("reassigns pending tasks and reminder recipients, preserves history, revokes old advisor access", async () => {
    expect(
      (
        await request(
          "PATCH",
          `/clients/${clientId}/assignment`,
          { advisorId: externalAdvisor.id },
          owner.cookie,
        )
      ).statusCode,
    ).toBe(422);
    expect(
      (
        await request(
          "PATCH",
          `/clients/${clientId}/assignment`,
          { advisorId: secondAdvisor.id },
          owner.cookie,
        )
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await request(
          "GET",
          `/clients/${clientId}/history`,
          undefined,
          advisor.cookie,
        )
      ).statusCode,
    ).toBe(404);
    expect(
      (await request("GET", "/activities", undefined, advisor.cookie)).json()
        .data,
    ).toEqual([]);
    const history = await request(
      "GET",
      `/clients/${clientId}/history`,
      undefined,
      secondAdvisor.cookie,
    );
    const entries = history.json().data as {
      status: string;
      advisor: { id: string };
    }[];
    expect(entries).toHaveLength(3);
    // Past activities keep the advisor who actually worked them; only the
    // still-pending one moved — this is the audit trail the reassignment
    // must preserve.
    expect(entries.filter((e) => e.status === "completed")).toHaveLength(2);
    expect(entries.find((e) => e.status === "completed")?.advisor.id).toBe(
      advisor.id,
    );
    expect(entries.find((e) => e.status === "scheduled")?.advisor.id).toBe(
      secondAdvisor.id,
    );
    const pending = await db.activity.findFirstOrThrow({
      where: { clientId, status: "scheduled" },
      include: { email: true },
    });
    expect(pending.advisorId).toBe(secondAdvisor.id);
    expect(pending.email?.recipient).toBe(
      `Luis-${suffix}@example.test`.toLowerCase(),
    );
  });
  it("delivers a due reminder once in normal operation and skips cancelled jobs", async () => {
    const sent: string[] = [];
    const worker = new NotificationService(new NotificationRepository(db), {
      send: async (job) => {
        sent.push(job.id);
      },
    });
    // Advance only this run's reminder and keep the worker clock at the present time.
    await db.emailJob.updateMany({
      where: {
        organizationId: owner.organizationId,
        activity: { clientId, status: "scheduled" },
      },
      data: { availableAt: new Date(Date.now() - 1000) },
    });
    await worker.run();
    await worker.run();
    const reminder = await db.emailJob.findFirstOrThrow({
      where: {
        organizationId: owner.organizationId,
        activity: { clientId, status: "scheduled" },
      },
    });
    expect(sent.filter((id) => id === reminder.id)).toHaveLength(1);
    expect(
      (await db.emailJob.findUniqueOrThrow({ where: { activityId } })).sentAt,
    ).toBeNull();
  });
  it("isolates the development mailbox by tenant and disables it in production", async () => {
    const messages = (
      await request("GET", "/development/mailbox", undefined, other.cookie)
    ).json().data;
    expect(
      messages.every(
        (m: { recipient: string }) => !m.recipient.includes("Ana-"),
      ),
    ).toBe(true);
    const prod = await createApp(db, {
      origin,
      production: true,
      localMail: false,
    });
    expect(
      (
        await prod.inject({
          method: "GET",
          url: "/development/mailbox",
          headers: { cookie: owner.cookie },
        })
      ).statusCode,
    ).toBe(404);
    await prod.close();
  });
  it("revokes sessions on logout", async () => {
    expect(
      (await request("POST", "/auth/logout", {}, advisor.cookie)).statusCode,
    ).toBe(200);
    expect(
      (await request("GET", "/auth/me", undefined, advisor.cookie)).statusCode,
    ).toBe(401);
    expect(
      (
        await request("POST", "/auth/login", {
          email: `ana-${suffix}@example.test`,
          password: "wrong-password-123",
        })
      ).statusCode,
    ).toBe(401);
  });
});
describe.sequential("billing simulation restricted to the demo company", () => {
  const demoAddress = `2001:db8:${suffix.slice(9, 13)}:${suffix.slice(14, 18)}::2`;
  let coordinator = "";
  let demoAdvisor = "";
  let administrative = "";
  let platform = "";
  let version = 0;
  async function login(email: string) {
    const response = await request(
      "POST",
      "/auth/login",
      { email, password: DEMO_PASSWORD },
      "",
      demoAddress,
    );
    expect(response.statusCode).toBe(200);
    return session(response);
  }
  beforeAll(async () => {
    await seedDemo(db);
    coordinator = await login("coordinador@ruts68.test");
    demoAdvisor = await login("asesor@ruts68.test");
    administrative = await login("administrativo@ruts68.test");
    platform = await login("plataforma@ruts68.test");
  }, 30000);
  it("seeds a platform user for the visual WhatsApp number console", async () => {
    const response = await request(
      "GET",
      "/platform/whatsapp-numbers",
      undefined,
      platform,
    );
    expect(response.statusCode).toBe(200);
    expect(
      response
        .json()
        .data.some(
          (number: { organization: { id: string } }) =>
            number.organization.id === DEMO_ORGANIZATION_ID,
        ),
    ).toBe(true);
  });
  it("hides the simulation from other companies and from anonymous visitors", async () => {
    expect((await request("GET", "/billing/settings")).statusCode).toBe(401);
    for (const [method, path] of [
      ["GET", "/billing/settings"],
      ["GET", "/billing/simulations"],
    ] as const)
      expect(
        (await request(method, path, undefined, owner.cookie)).statusCode,
      ).toBe(404);
    expect(
      (
        await request(
          "POST",
          "/billing/quote",
          { planId: "growth", users: 5 },
          owner.cookie,
        )
      ).statusCode,
    ).toBe(404);
  });
  it("requires a coordination profile to read and a commercial one to write", async () => {
    expect(
      (await request("GET", "/billing/settings", undefined, demoAdvisor))
        .statusCode,
    ).toBe(403);
    expect(
      (await request("GET", "/billing/settings", undefined, administrative))
        .statusCode,
    ).toBe(200);
    expect(
      (
        await request(
          "POST",
          "/billing/quote",
          { planId: "growth", users: 5 },
          administrative,
        )
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await request(
          "POST",
          "/billing/simulations",
          {
            planId: "growth",
            users: 5,
            expectedVersion: 1,
            outcome: "approved",
            idempotencyKey: crypto.randomUUID(),
          },
          demoAdvisor,
        )
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await request(
          "POST",
          "/billing/simulations",
          {
            planId: "growth",
            users: 5,
            expectedVersion: 1,
            outcome: "approved",
            idempotencyKey: crypto.randomUUID(),
          },
          administrative,
        )
      ).statusCode,
    ).toBe(403);
  });
  it("seeds an administrative coordinator with read-only workspace access", async () => {
    const users = await request("GET", "/users", undefined, administrative);
    expect(users.statusCode).toBe(200);
    expect(
      users
        .json()
        .data.some(
          (user: { email: string; role: string }) =>
            user.email === "administrativo@ruts68.test" &&
            user.role === "administrative_coordinator",
        ),
    ).toBe(true);
    const clients = await request(
      "GET",
      "/clients?limit=100",
      undefined,
      administrative,
    );
    expect(clients.statusCode).toBe(200);
    expect(clients.json().data.length).toBeGreaterThanOrEqual(6);
    expect(
      (await request("GET", "/activities", undefined, administrative))
        .statusCode,
    ).toBe(200);
    expect(
      (
        await request(
          "POST",
          "/clients",
          {
            name: "Cliente administrativo bloqueado",
            contactName: "Prueba permisos",
            email: "bloqueado-admin@example.test",
            phone: "0000000999",
            city: "Bogotá",
            notes: "Debe fallar porque el perfil administrativo solo consulta.",
            advisorId: clients.json().data[0].advisor.id,
          },
          administrative,
        )
      ).statusCode,
    ).toBe(403);
  });
  it("quotes the selected plan in whole minor units against the stored configuration", async () => {
    const settings = await request(
      "GET",
      "/billing/settings",
      undefined,
      coordinator,
    );
    expect(settings.statusCode).toBe(200);
    version = settings.json().data.version;
    expect(settings.json().data.configuration.mode).toBe("simulation");
    const quote = await request(
      "POST",
      "/billing/quote",
      { planId: "growth", users: 7 },
      coordinator,
    );
    expect(quote.statusCode).toBe(200);
    const data = quote.json().data;
    expect(data.version).toBe(version);
    expect(data.additionalUsers).toBe(2);
    expect(data.totalMinor).toBe(
      data.subtotalMinor +
        data.supportMinor +
        data.gatewayMinor +
        data.taxMinor,
    );
    expect(Number.isInteger(data.totalMinor)).toBe(true);
    expect(
      (
        await request(
          "POST",
          "/billing/quote",
          { planId: "growth", users: 0 },
          coordinator,
        )
      ).statusCode,
    ).toBe(400);
  });
  it("opens a company checkout, records its receipt and activates the membership", async () => {
    const checkout = await request(
      "POST",
      "/billing/checkout",
      {
        planId: "growth",
        users: 6,
        customerName: "Coordinador Demo",
        customerEmail: "coordinador@ruts68.test",
        customerPhone: "3001234567",
      },
      coordinator,
    );
    expect(checkout.statusCode).toBe(201);
    const data = checkout.json().data;
    expect(data.mode).toBe("simulation");
    expect(data.reference).toMatch(/^RUTS68-/);
    expect(data.customerData.email).toBe("coordinador@ruts68.test");
    expect(
      (
        await request(
          "GET",
          `/billing/payments/${data.reference}`,
          undefined,
          coordinator,
        )
      ).json().data.status,
    ).toBe("pending");
    const simulated = await request(
      "POST",
      "/billing/simulations",
      {
        planId: "growth",
        users: 6,
        expectedVersion: data.quote.version,
        outcome: "approved",
        reference: data.reference,
        idempotencyKey: crypto.randomUUID(),
      },
      coordinator,
    );
    expect(simulated.statusCode).toBe(201);
    const receipt = await request(
      "GET",
      `/billing/payments/${data.reference}`,
      undefined,
      administrative,
    );
    expect(receipt.statusCode).toBe(200);
    expect(receipt.json().data.status).toBe("approved");
    const organization = await request(
      "GET",
      "/organization",
      undefined,
      coordinator,
    );
    expect(organization.json().data.membershipPlan).toBe("growth");
    expect(organization.json().data.membershipStatus).toBe("active");
    expect(
      (
        await request(
          "GET",
          `/billing/payments/${data.reference}`,
          undefined,
          owner.cookie,
        )
      ).statusCode,
    ).toBe(404);
  });
  it("exposes membership state to the platform without exposing customer data", async () => {
    const response = await request(
      "GET",
      "/platform/organizations",
      undefined,
      platform,
    );
    expect(response.statusCode).toBe(200);
    const demo = response
      .json()
      .data.find((item: { id: string }) => item.id === DEMO_ORGANIZATION_ID);
    expect(demo.membershipPlan).toBe("growth");
    expect(demo.membershipStatus).toBe("active");
    expect(demo._count.clients).toBeGreaterThan(0);
    expect(demo.customerEmail).toBeUndefined();
    expect(
      (await request("GET", "/platform/organizations", undefined, coordinator))
        .statusCode,
    ).toBe(403);
  });
  it("accepts a signed Wompi transaction event and updates the receipt", async () => {
    const checkout = await request(
      "POST",
      "/billing/checkout",
      {
        planId: "essential",
        users: 2,
        customerName: "Coordinador Demo",
        customerEmail: "coordinador@ruts68.test",
      },
      coordinator,
    );
    const data = checkout.json().data;
    const timestamp = 1_758_000_000;
    const transaction = {
      id: `wompi-${suffix.slice(0, 8)}`,
      status: "APPROVED",
      amount_in_cents: data.quote.totalMinor,
      reference: data.reference,
    };
    const properties = [
      "transaction.id",
      "transaction.status",
      "transaction.amount_in_cents",
    ];
    const values = `${transaction.id}${transaction.status}${transaction.amount_in_cents}`;
    const checksum = createHash("sha256")
      .update(`${values}${timestamp}wompi-events-test-secret`)
      .digest("hex");
    const event = {
      event: "transaction.updated",
      data: { transaction },
      environment: "test",
      signature: { properties, checksum },
      timestamp,
    };
    const response = await request("POST", "/webhooks/wompi", event);
    expect(response.statusCode).toBe(200);
    const receipt = await request(
      "GET",
      `/billing/payments/${data.reference}`,
      undefined,
      administrative,
    );
    expect(receipt.json().data.status).toBe("approved");
    expect(receipt.json().data.transactionId).toBe(transaction.id);
  });
  it("stores one simulation per idempotency key and rejects a reused key with other data", async () => {
    const payload = {
      planId: "growth" as const,
      users: 7,
      expectedVersion: version,
      outcome: "approved" as const,
      idempotencyKey: crypto.randomUUID(),
    };
    const created = await request(
      "POST",
      "/billing/simulations",
      payload,
      coordinator,
    );
    expect(created.statusCode).toBe(201);
    const simulationId = created.json().data.id;
    expect(created.json().data.snapshot.quote.totalMinor).toBeGreaterThan(0);
    expect(
      (
        await request("POST", "/billing/simulations", payload, coordinator)
      ).json().data.id,
    ).toBe(simulationId);
    expect(
      (
        await request(
          "POST",
          "/billing/simulations",
          { ...payload, users: 9 },
          coordinator,
        )
      ).statusCode,
    ).toBe(409);
    expect(
      await db.paymentSimulation.count({
        where: {
          organizationId: DEMO_ORGANIZATION_ID,
          idempotencyKey: payload.idempotencyKey,
        },
      }),
    ).toBe(1);
    expect(
      await db.auditEvent.count({
        where: {
          organizationId: DEMO_ORGANIZATION_ID,
          action: "billing.simulation.approved",
          resourceId: simulationId,
        },
      }),
    ).toBe(1);
    expect(
      (await request("GET", "/billing/simulations", undefined, coordinator))
        .json()
        .data.map((s: { id: string }) => s.id),
    ).toContain(simulationId);
  });
  it("rejects a stale configuration on save and on a quote already shown to the user", async () => {
    const settings = (
      await request("GET", "/billing/settings", undefined, coordinator)
    ).json().data;
    const updated = await request(
      "PATCH",
      "/billing/settings",
      {
        version: settings.version,
        configuration: { ...settings.configuration, supportBps: 600 },
      },
      coordinator,
    );
    expect(updated.statusCode).toBe(200);
    expect(updated.json().data.version).toBe(settings.version + 1);
    expect(
      (
        await request(
          "PATCH",
          "/billing/settings",
          {
            version: settings.version,
            configuration: { ...settings.configuration, supportBps: 700 },
          },
          coordinator,
        )
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await request(
          "POST",
          "/billing/simulations",
          {
            planId: "growth",
            users: 7,
            expectedVersion: settings.version,
            outcome: "approved",
            idempotencyKey: crypto.randomUUID(),
          },
          coordinator,
        )
      ).statusCode,
    ).toBe(409);
    expect(
      await db.auditEvent.count({
        where: {
          organizationId: DEMO_ORGANIZATION_ID,
          action: "billing.simulation.configured",
        },
      }),
    ).toBeGreaterThan(0);
  });
});
describe.sequential("WhatsApp chat: numbers, webhook and conversations", () => {
  const waSuffix = suffix.slice(0, 8);
  const appSecret = `wa-app-secret-${waSuffix}`;
  const verifyToken = `wa-verify-token-${waSuffix}`;
  const phoneNumberId = `wa-phone-${waSuffix}`;
  const contactPhone = `57300${waSuffix}`;
  let whatsappApp: FastifyInstance;
  let sent: {
    to: string;
    body?: string;
    templateName?: string;
    languageCode?: string;
    variables?: string[];
  }[] = [];
  let shouldFail = false;
  const fakeTransport: WhatsAppTransport = {
    async sendText({ to, body }) {
      sent.push({ to, body });
      if (shouldFail) throw new Error("simulated delivery failure");
      return { waMessageId: `wamid.out.${waSuffix}.${sent.length}` };
    },
    async sendTemplate({ to, templateName, languageCode, variables }) {
      sent.push({ to, templateName, languageCode, variables });
      if (shouldFail) throw new Error("simulated template failure");
      return { waMessageId: `wamid.template.${waSuffix}.${sent.length}` };
    },
    async downloadMedia({ mediaId }) {
      return {
        mimeType: "image/png",
        bytes: new TextEncoder().encode(`downloaded:${mediaId}`),
      };
    },
  };
  let admin: { cookie: string; id: string };
  // advisor.cookie was already revoked by the "revokes sessions on logout"
  // test earlier in this file; this suite needs its own live advisor.
  let waAdvisor: { cookie: string; id: string };
  let numberId: string;
  let conversationId: string;
  async function wa(
    method: "GET" | "POST" | "PATCH",
    path: string,
    body?: unknown,
    cookie = "",
  ) {
    return whatsappApp.inject({
      method,
      url: path,
      remoteAddress,
      headers: { origin, "x-ruts68-request": "1", cookie },
      ...(body === undefined
        ? {}
        : { payload: body as Record<string, unknown> }),
    });
  }
  function inboundEvent(overrides: {
    waMessageId: string;
    body?: string;
    type?: "text" | "image";
    mediaId?: string;
  }) {
    return JSON.stringify({
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: phoneNumberId },
                contacts: [
                  {
                    wa_id: contactPhone,
                    profile: { name: "Cliente de prueba" },
                  },
                ],
                messages: [
                  overrides.type === "image"
                    ? {
                        from: contactPhone,
                        id: overrides.waMessageId,
                        type: "image",
                        image: {
                          id: overrides.mediaId,
                          caption: overrides.body ?? "",
                        },
                      }
                    : {
                        from: contactPhone,
                        id: overrides.waMessageId,
                        type: "text",
                        text: { body: overrides.body ?? "Hola" },
                      },
                ],
              },
            },
          ],
        },
      ],
    });
  }
  function sign(rawBody: string) {
    return (
      "sha256=" + createHmac("sha256", appSecret).update(rawBody).digest("hex")
    );
  }
  beforeAll(async () => {
    whatsappApp = await createApp(db, {
      origin,
      production: false,
      localMail: true,
      metaWebhookVerifyToken: verifyToken,
      metaAppSecret: appSecret,
      whatsappTransport: fakeTransport,
    });
    const adminEmail = `admin-${waSuffix}@example.test`;
    await db.user.create({
      data: {
        organizationId: null,
        name: "Admin de plataforma",
        email: adminEmail,
        passwordHash: await hashPassword(password),
        role: "super_admin",
      },
    });
    const login = await wa("POST", "/auth/login", {
      email: adminEmail,
      password,
    });
    admin = { cookie: session(login), id: login.json().data.id };
    waAdvisor = await invite(owner, `WaAsesor-${waSuffix}`);
  }, 30000);
  afterAll(async () => {
    await whatsappApp?.close();
  });
  it("only a platform user can register a number, scoped to one company", async () => {
    expect(
      (
        await wa(
          "POST",
          "/platform/whatsapp-numbers",
          {
            organizationId: owner.organizationId,
            phoneNumberId,
            displayPhoneNumber: "+57 300 000 0000",
            label: "Línea comercial",
            accessToken: "EAAG" + "x".repeat(40),
          },
          owner.cookie,
        )
      ).statusCode,
    ).toBe(403);
    const created = await wa(
      "POST",
      "/platform/whatsapp-numbers",
      {
        organizationId: owner.organizationId,
        phoneNumberId,
        displayPhoneNumber: "+57 300 000 0000",
        label: "Línea comercial",
        accessToken: "EAAG" + "x".repeat(40),
      },
      admin.cookie,
    );
    expect(created.statusCode).toBe(201);
    numberId = created.json().data.id;
    expect(created.json().data.accessTokenCipher).not.toContain("EAAG");
    expect(
      await db.auditEvent.count({
        where: {
          organizationId: owner.organizationId,
          action: "whatsapp.number.registered",
          resourceId: numberId,
        },
      }),
    ).toBe(1);
  });
  it("only shows a company the numbers registered for it, unassigned until the coordinator assigns one", async () => {
    const list = await wa("GET", "/whatsapp/numbers", undefined, owner.cookie);
    expect(list.statusCode).toBe(200);
    expect(list.json().data).toHaveLength(1);
    expect(list.json().data[0].advisor).toBeNull();
    expect(
      (await wa("GET", "/whatsapp/numbers", undefined, other.cookie)).json()
        .data,
    ).toEqual([]);
  });
  it("requires commercial coordination to assign, and rejects an advisor from another company", async () => {
    expect(
      (
        await wa(
          "PATCH",
          `/whatsapp/numbers/${numberId}/assignment`,
          { advisorId: waAdvisor.id },
          waAdvisor.cookie,
        )
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await wa(
          "PATCH",
          `/whatsapp/numbers/${numberId}/assignment`,
          { advisorId: externalAdvisor.id },
          owner.cookie,
        )
      ).statusCode,
    ).toBe(422);
    const assigned = await wa(
      "PATCH",
      `/whatsapp/numbers/${numberId}/assignment`,
      { advisorId: waAdvisor.id },
      owner.cookie,
    );
    expect(assigned.statusCode).toBe(200);
    expect(assigned.json().data.advisor.id).toBe(waAdvisor.id);
  });
  it("lets an advisor read only their own assigned number, not the rest of the company's", async () => {
    const mine = await wa(
      "GET",
      "/whatsapp/numbers",
      undefined,
      waAdvisor.cookie,
    );
    expect(mine.json().data).toHaveLength(1);
    expect(mine.json().data[0].id).toBe(numberId);
    expect(
      (
        await wa("GET", "/whatsapp/numbers", undefined, secondAdvisor.cookie)
      ).json().data,
    ).toEqual([]);
  });
  it("rejects the GET handshake with the wrong verify token and echoes the challenge with the right one", async () => {
    const wrong = await whatsappApp.inject({
      method: "GET",
      url: `/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=123`,
    });
    expect(wrong.statusCode).toBe(403);
    const right = await whatsappApp.inject({
      method: "GET",
      url: `/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=${verifyToken}&hub.challenge=echo-me`,
    });
    expect(right.statusCode).toBe(200);
    expect(right.body).toBe("echo-me");
  });
  it("rejects a POST event with a missing or wrong signature", async () => {
    const body = inboundEvent({ waMessageId: `wamid.rejected.${waSuffix}` });
    expect(
      (
        await whatsappApp.inject({
          method: "POST",
          url: "/webhooks/whatsapp",
          headers: { "content-type": "application/json" },
          payload: body,
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await whatsappApp.inject({
          method: "POST",
          url: "/webhooks/whatsapp",
          headers: {
            "content-type": "application/json",
            "x-hub-signature-256": "sha256=wrong",
          },
          payload: body,
        })
      ).statusCode,
    ).toBe(401);
    expect(
      await db.whatsAppMessage.count({
        where: { waMessageId: `wamid.rejected.${waSuffix}` },
      }),
    ).toBe(0);
  });
  it("ingests a verified inbound message into a new conversation, visible only to its assigned advisor and to the coordinator", async () => {
    const body = inboundEvent({
      waMessageId: `wamid.in.${waSuffix}`,
      body: "Hola, quiero información",
    });
    const response = await whatsappApp.inject({
      method: "POST",
      url: "/webhooks/whatsapp",
      headers: {
        "content-type": "application/json",
        "x-hub-signature-256": sign(body),
      },
      payload: body,
    });
    expect(response.statusCode).toBe(200);
    const asAdvisor = await wa(
      "GET",
      "/whatsapp/conversations",
      undefined,
      waAdvisor.cookie,
    );
    expect(asAdvisor.json().data).toHaveLength(1);
    conversationId = asAdvisor.json().data[0].id;
    expect(asAdvisor.json().data[0].contactPhone).toBe(contactPhone);
    expect(
      (
        await wa("GET", "/whatsapp/conversations", undefined, owner.cookie)
      ).json().data,
    ).toHaveLength(1);
    expect(
      (
        await wa(
          "GET",
          "/whatsapp/conversations",
          undefined,
          secondAdvisor.cookie,
        )
      ).json().data,
    ).toEqual([]);
    const messages = await wa(
      "GET",
      `/whatsapp/conversations/${conversationId}/messages`,
      undefined,
      waAdvisor.cookie,
    );
    expect(messages.json().data).toHaveLength(1);
    expect(messages.json().data[0]).toMatchObject({
      direction: "inbound",
      body: "Hola, quiero información",
    });
  });
  it("delivers the same inbound event only once even if Meta retries it", async () => {
    const body = inboundEvent({
      waMessageId: `wamid.in.${waSuffix}`,
      body: "Hola, quiero información",
    });
    const retry = await whatsappApp.inject({
      method: "POST",
      url: "/webhooks/whatsapp",
      headers: {
        "content-type": "application/json",
        "x-hub-signature-256": sign(body),
      },
      payload: body,
    });
    expect(retry.statusCode).toBe(200);
    expect(
      await db.whatsAppMessage.count({
        where: { waMessageId: `wamid.in.${waSuffix}` },
      }),
    ).toBe(1);
  });
  it("downloads supported inbound media when the transport can retrieve it", async () => {
    const body = inboundEvent({
      waMessageId: `wamid.media.${waSuffix}`,
      body: "Foto de referencia",
      type: "image",
      mediaId: `media.${waSuffix}`,
    });
    const response = await whatsappApp.inject({
      method: "POST",
      url: "/webhooks/whatsapp",
      headers: {
        "content-type": "application/json",
        "x-hub-signature-256": sign(body),
      },
      payload: body,
    });
    expect(response.statusCode).toBe(200);
    const messages = await wa(
      "GET",
      `/whatsapp/conversations/${conversationId}/messages`,
      undefined,
      waAdvisor.cookie,
    );
    const media = messages
      .json()
      .data.find(
        (message: { waMessageId: string }) =>
          message.waMessageId === `wamid.media.${waSuffix}`,
      );
    expect(media).toMatchObject({
      type: "image",
      body: "Foto de referencia",
      mediaId: `media.${waSuffix}`,
    });
    expect(media.mediaUrl).toMatch(/^data:image\/png;base64,/);
  });
  it("links an existing conversation when a client is created from its phone", async () => {
    const created = await wa(
      "POST",
      "/clients",
      {
        name: "Cliente desde WhatsApp",
        contactName: "Cliente de prueba",
        phone: contactPhone,
        city: "Bogotá",
        advisorId: waAdvisor.id,
        notes: "Creado desde una conversación previa.",
      },
      owner.cookie,
    );
    expect(created.statusCode).toBe(201);
    const clientId = created.json().data.id as string;
    const conversations = await wa(
      "GET",
      "/whatsapp/conversations",
      undefined,
      owner.cookie,
    );
    const linked = conversations
      .json()
      .data.find(
        (conversation: { id: string }) => conversation.id === conversationId,
      );
    expect(linked.client).toMatchObject({
      id: clientId,
      name: "Cliente desde WhatsApp",
    });
    expect(
      await db.auditEvent.count({
        where: {
          organizationId: owner.organizationId,
          action: "client.linked_from_whatsapp",
          resourceId: clientId,
        },
      }),
    ).toBe(1);
  });
  it("only the number's assigned advisor or the coordinator can send, and a failed delivery is recorded honestly", async () => {
    expect(
      (
        await wa(
          "POST",
          `/whatsapp/conversations/${conversationId}/messages`,
          { body: "No debería poder" },
          secondAdvisor.cookie,
        )
      ).statusCode,
    ).toBe(404);
    const okSend = await wa(
      "POST",
      `/whatsapp/conversations/${conversationId}/messages`,
      { body: "Claro, te comparto la información" },
      waAdvisor.cookie,
    );
    expect(okSend.statusCode).toBe(201);
    expect(okSend.json().data.status).toBe("sent");
    expect(sent.at(-1)).toMatchObject({
      to: contactPhone,
      body: "Claro, te comparto la información",
    });
    shouldFail = true;
    const failedSend = await wa(
      "POST",
      `/whatsapp/conversations/${conversationId}/messages`,
      { body: "Este envío va a fallar" },
      owner.cookie,
    );
    expect(failedSend.statusCode).toBe(201);
    expect(failedSend.json().data.status).toBe("failed");
    shouldFail = false;
  });
  it("sends approved Meta templates through the same conversation permissions", async () => {
    expect(
      (
        await wa(
          "POST",
          `/whatsapp/conversations/${conversationId}/templates`,
          {
            templateName: "seguimiento_cliente",
            languageCode: "es_CO",
            variables: ["Laura", "jueves"],
          },
          secondAdvisor.cookie,
        )
      ).statusCode,
    ).toBe(404);
    const sentTemplate = await wa(
      "POST",
      `/whatsapp/conversations/${conversationId}/templates`,
      {
        templateName: "seguimiento_cliente",
        languageCode: "es_CO",
        variables: ["Laura", "jueves"],
      },
      owner.cookie,
    );
    expect(sentTemplate.statusCode).toBe(201);
    expect(sentTemplate.json().data.status).toBe("sent");
    expect(sentTemplate.json().data.body).toContain(
      "Plantilla Meta seguimiento_cliente",
    );
    expect(sent.at(-1)).toMatchObject({
      to: contactPhone,
      templateName: "seguimiento_cliente",
      languageCode: "es_CO",
      variables: ["Laura", "jueves"],
    });
  });
  it("marks a message delivered when Meta reports its status", async () => {
    const okSend = await wa(
      "POST",
      `/whatsapp/conversations/${conversationId}/messages`,
      { body: "Un mensaje más para confirmar entrega" },
      waAdvisor.cookie,
    );
    const waMessageId = okSend.json().data.waMessageId as string;
    const statusBody = JSON.stringify({
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: phoneNumberId },
                statuses: [{ id: waMessageId, status: "delivered" }],
              },
            },
          ],
        },
      ],
    });
    const response = await whatsappApp.inject({
      method: "POST",
      url: "/webhooks/whatsapp",
      headers: {
        "content-type": "application/json",
        "x-hub-signature-256": sign(statusBody),
      },
      payload: statusBody,
    });
    expect(response.statusCode).toBe(200);
    expect(
      (await db.whatsAppMessage.findUniqueOrThrow({ where: { waMessageId } }))
        .status,
    ).toBe("delivered");
  });
});
