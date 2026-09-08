import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { PrismaClient } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { createApp } from "../src/app.js";
import { NotificationService } from "../src/notifications/NotificationService.js";
import { NotificationRepository } from "../src/notifications/NotificationRepository.js";
import { seedDemo, DEMO_PASSWORD } from "../src/development/seed.js";
import { DEMO_ORGANIZATION_ID } from "../src/billing/BillingTypes.js";
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
  app = await createApp(db, { origin, production: false, localMail: true });
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
    expect(entries).toHaveLength(2);
    // Past activities keep the advisor who actually worked them; only the
    // still-pending one moved — this is the audit trail the reassignment
    // must preserve.
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
  }, 30000);
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
