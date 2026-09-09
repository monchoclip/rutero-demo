import { describe, it, expect } from "vitest";
import { addCalendarMonth } from "../src/shared/dates.js";
import {
  hashPassword,
  verifyPassword,
  hashToken,
  newToken,
} from "../src/shared/security.js";
import {
  requireCommercial,
  requireWriter,
  scope,
} from "../src/crm/CrmTypes.js";
import type { Actor } from "../src/identity/IdentityTypes.js";
import { completeSchema, clientSchema } from "../src/crm/CrmSchema.js";
import {
  verifyHandshake,
  verifySignature,
  parseInboundEvents,
} from "../src/whatsapp/meta.js";
import {
  registerNumberSchema,
  templateMessageSchema,
} from "../src/whatsapp/WhatsAppSchema.js";
import { encryptSecret, decryptSecret } from "../src/shared/secrets.js";
import { createHmac } from "node:crypto";
import {
  calculateQuote,
  defaultBillingConfig,
} from "../src/billing/BillingTypes.js";
import {
  billingConfigSchema,
  simulationSchema,
} from "../src/billing/BillingSchema.js";
import {
  visitEvidenceCapabilities,
  visitVerificationStatus,
} from "../src/crm/VisitTypes.js";
describe("calendar-month trial", () => {
  it.each([
    ["2026-01-31T14:10:00.000Z", "2026-02-28T14:10:00.000Z"],
    ["2028-01-31T14:10:00.000Z", "2028-02-29T14:10:00.000Z"],
    ["2026-12-31T14:10:00.000Z", "2027-01-31T14:10:00.000Z"],
    ["2026-09-08T14:10:00.000Z", "2026-10-08T14:10:00.000Z"],
  ])("clamps %s correctly", (from, to) => {
    const original = new Date(from);
    expect(addCalendarMonth(original).toISOString()).toBe(to);
    expect(original.toISOString()).toBe(from);
  });
});
describe("passwords and authorization", () => {
  it("salts passwords and rejects wrong passwords without storing plain text", async () => {
    const first = await hashPassword("una-clave-larga-123");
    const second = await hashPassword("una-clave-larga-123");
    expect(first).not.toBe(second);
    expect(first).not.toContain("una-clave");
    expect(await verifyPassword("una-clave-larga-123", first)).toBe(true);
    expect(await verifyPassword("otra-clave-larga", first)).toBe(false);
    expect(await verifyPassword("anything", "broken")).toBe(false);
  });
  it("generates distinct tokens and one-way session lookup keys", () => {
    const token = newToken();
    expect(token).toHaveLength(64);
    expect(newToken()).not.toBe(token);
    expect(hashToken(token)).not.toBe(token);
  });
  const actor: Actor = {
    id: "advisor",
    organizationId: "company",
    role: "advisor",
    name: "Asesor",
    email: "a@example.test",
  };
  it("scopes advisers to their company and portfolio", () =>
    expect(scope(actor)).toEqual({
      organizationId: "company",
      advisorId: "advisor",
    }));
  it("rejects advisor privilege escalation", () =>
    expect(() => requireCommercial(actor)).toThrow());
  it("keeps administrative coordinators read-only for the commercial portfolio", () =>
    expect(() =>
      requireWriter({ ...actor, role: "administrative_coordinator" }),
    ).toThrow());
  it("does not give platform admins implicit tenant access", () =>
    expect(() =>
      scope({ ...actor, organizationId: null, role: "super_admin" }),
    ).toThrow());
  it("rejects negative durations and unrecognized client fields", () => {
    expect(
      completeSchema.safeParse({
        outcome: "contacted",
        notes: "Hecho",
        durationSeconds: -1,
      }).success,
    ).toBe(false);
    expect(
      clientSchema.safeParse({
        name: "Cliente",
        contactName: "Ana",
        phone: "3000000000",
        city: "Cali",
        advisorId: crypto.randomUUID(),
        organizationId: crypto.randomUUID(),
      }).success,
    ).toBe(false);
  });
});
describe("billing simulation math", () => {
  const config = defaultBillingConfig;
  it("charges only the base fee while the plan covers every user", () => {
    const quote = calculateQuote(config, { planId: "essential", users: 2 });
    expect(quote.additionalUsers).toBe(0);
    expect(quote.extraUsersMinor).toBe(0);
    expect(quote.subtotalMinor).toBe(4_900_000);
    expect(quote.supportMinor).toBe(245_000);
    expect(quote.gatewayMinor).toBe(239_205);
    expect(quote.totalMinor).toBe(5_384_205);
  });
  it("bills each user above the plan and keeps the total consistent", () => {
    const quote = calculateQuote(config, { planId: "growth", users: 7 });
    expect(quote.additionalUsers).toBe(2);
    expect(quote.extraUsersMinor).toBe(3_000_000);
    expect(quote.subtotalMinor).toBe(15_900_000);
    expect(quote.totalMinor).toBe(
      quote.subtotalMinor +
        quote.supportMinor +
        quote.gatewayMinor +
        quote.taxMinor,
    );
    expect(quote.totalMinor).toBe(17_269_155);
  });
  it("keeps every amount in whole minor units and rounds fractions up", () => {
    // One peso at 5% is 0.05 minor units: rounding up avoids charging less than the rate.
    const rounded = calculateQuote(
      {
        ...config,
        gatewayFixedMinor: 0,
        gatewayBps: 0,
        plans: config.plans.map((plan) => ({
          ...plan,
          baseMinor: 1,
          userMinor: 0,
        })),
      },
      { planId: "essential", users: 1 },
    );
    expect(rounded.supportMinor).toBe(1);
    expect(rounded.totalMinor).toBe(2);
    expect(Number.isInteger(rounded.totalMinor)).toBe(true);
  });
  it("applies the configured tax rate over support and gateway only", () => {
    // The taxable base is a pending commercial decision; the default rate is zero.
    expect(
      calculateQuote(config, { planId: "essential", users: 2 }).taxMinor,
    ).toBe(0);
    const taxed = calculateQuote(
      { ...config, taxBps: 1900 },
      { planId: "essential", users: 2 },
    );
    expect(taxed.taxMinor).toBe(Math.ceil((245_000 + 239_205) * 0.19));
    expect(taxed.totalMinor - taxed.taxMinor).toBe(5_384_205);
  });
  it("rejects an unknown plan and a configuration with repeated or unbounded plans", () => {
    const withoutEssential = {
      ...config,
      plans: config.plans.filter((plan) => plan.id !== "essential"),
    };
    expect(() =>
      calculateQuote(withoutEssential, { planId: "essential", users: 1 }),
    ).toThrow();
    expect(
      billingConfigSchema.safeParse({
        ...config,
        plans: [config.plans[0], config.plans[0], config.plans[1]],
      }).success,
    ).toBe(false);
    expect(
      billingConfigSchema.safeParse({ ...config, supportBps: 10_001 }).success,
    ).toBe(false);
    expect(
      billingConfigSchema.safeParse({ ...config, mode: "live" }).success,
    ).toBe(false);
  });
  it("requires an idempotency key and a known outcome for every simulation", () => {
    const valid = {
      planId: "growth",
      users: 5,
      expectedVersion: 1,
      outcome: "approved",
      idempotencyKey: crypto.randomUUID(),
    };
    expect(simulationSchema.safeParse(valid).success).toBe(true);
    expect(
      simulationSchema.safeParse({ ...valid, idempotencyKey: "abc" }).success,
    ).toBe(false);
    expect(
      simulationSchema.safeParse({ ...valid, outcome: "captured" }).success,
    ).toBe(false);
    expect(
      simulationSchema.safeParse({ ...valid, expectedVersion: 0 }).success,
    ).toBe(false);
  });
});
describe("visit evidence preparation", () => {
  it("keeps F4 visit evidence explicit without implying active tracking", () => {
    expect(visitEvidenceCapabilities).toEqual({
      location: "not_configured",
      photo: "not_configured",
      realtime: "not_configured",
    });
    expect(
      visitVerificationStatus({ type: "visit", status: "scheduled" }),
    ).toBe("planned");
    expect(
      visitVerificationStatus({ type: "visit", status: "completed" }),
    ).toBe("closed_without_evidence");
    expect(visitVerificationStatus({ type: "call", status: "scheduled" })).toBe(
      null,
    );
  });
});
describe("WhatsApp webhook verification and parsing", () => {
  const secret = "unit-test-app-secret";
  const sign = (body: string) =>
    "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
  it("echoes the challenge only for a correctly matched handshake", () => {
    const query = {
      "hub.mode": "subscribe",
      "hub.verify_token": "right-token",
      "hub.challenge": "12345",
    };
    expect(verifyHandshake(query, "right-token")).toBe("12345");
    expect(verifyHandshake(query, "wrong-token")).toBeNull();
    expect(
      verifyHandshake({ ...query, "hub.mode": "unsubscribe" }, "right-token"),
    ).toBeNull();
    expect(
      verifyHandshake({ "hub.mode": "subscribe" }, "right-token"),
    ).toBeNull();
  });
  it("only accepts an HMAC-SHA256 signature over the exact raw body", () => {
    const body = JSON.stringify({ entry: [] });
    expect(verifySignature(body, sign(body), secret)).toBe(true);
    expect(verifySignature(body, sign(body), "other-secret")).toBe(false);
    expect(verifySignature(body + " ", sign(body), secret)).toBe(false);
    expect(verifySignature(body, "not-a-real-signature", secret)).toBe(false);
    expect(verifySignature(body, undefined, secret)).toBe(false);
  });
  it("extracts inbound text and media messages with the sender's profile name", () => {
    const payload = {
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: "999" },
                contacts: [
                  { wa_id: "573001234567", profile: { name: "Laura" } },
                ],
                messages: [
                  {
                    from: "573001234567",
                    id: "wamid.TEXT1",
                    type: "text",
                    text: { body: "Hola, quiero información" },
                  },
                  {
                    from: "573001234567",
                    id: "wamid.IMG1",
                    type: "image",
                    image: { id: "media-abc", caption: "Foto del producto" },
                  },
                  {
                    from: "573001234567",
                    id: "wamid.STICKER1",
                    type: "sticker",
                    sticker: { id: "media-xyz" },
                  },
                ],
                statuses: [
                  { id: "wamid.OUT1", status: "delivered" },
                  { id: "wamid.OUT2", status: "bogus-status" },
                ],
              },
            },
          ],
        },
      ],
    };
    const { messages, statuses } = parseInboundEvents(JSON.stringify(payload));
    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({
      phoneNumberId: "999",
      contactPhone: "573001234567",
      contactName: "Laura",
      waMessageId: "wamid.TEXT1",
      type: "text",
      body: "Hola, quiero información",
      mediaId: null,
    });
    expect(messages[1]).toMatchObject({
      waMessageId: "wamid.IMG1",
      type: "image",
      body: "Foto del producto",
      mediaId: "media-abc",
    });
    expect(statuses).toEqual([
      { waMessageId: "wamid.OUT1", status: "delivered" },
    ]);
  });
  it("returns empty results instead of throwing on malformed or unrelated payloads", () => {
    expect(parseInboundEvents("not json")).toEqual({
      messages: [],
      statuses: [],
    });
    expect(parseInboundEvents(JSON.stringify({}))).toEqual({
      messages: [],
      statuses: [],
    });
    expect(
      parseInboundEvents(
        JSON.stringify({ entry: [{ changes: [{ value: {} }] }] }),
      ),
    ).toEqual({ messages: [], statuses: [] });
  });
  it("requires a plausible access token and phone number id to register a number", () => {
    const valid = {
      organizationId: crypto.randomUUID(),
      phoneNumberId: "123456789012345",
      displayPhoneNumber: "+57 300 000 0000",
      label: "Línea comercial",
      accessToken: "EAAG" + "x".repeat(40),
    };
    expect(registerNumberSchema.safeParse(valid).success).toBe(true);
    expect(
      registerNumberSchema.safeParse({ ...valid, accessToken: "short" })
        .success,
    ).toBe(false);
    expect(
      registerNumberSchema.safeParse({ ...valid, organizationId: "not-a-uuid" })
        .success,
    ).toBe(false);
  });
  it("accepts only Meta-style template names and language codes", () => {
    const valid = {
      templateName: "seguimiento_cliente",
      languageCode: "es_CO",
      variables: ["Laura", "jueves"],
    };
    expect(templateMessageSchema.safeParse(valid).success).toBe(true);
    expect(
      templateMessageSchema.safeParse({ ...valid, templateName: "Seguimiento" })
        .success,
    ).toBe(false);
    expect(
      templateMessageSchema.safeParse({ ...valid, languageCode: "spanish" })
        .success,
    ).toBe(false);
    expect(
      templateMessageSchema.safeParse({
        ...valid,
        variables: Array.from({ length: 11 }, (_, index) => String(index)),
      }).success,
    ).toBe(false);
  });
});
describe("WhatsApp token encryption", () => {
  it("round-trips a token and never stores it in plain text", async () => {
    process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY = "unit-test-encryption-key";
    const token = "EAAG-real-looking-access-token-value";
    const cipherText = encryptSecret(token);
    expect(cipherText).not.toContain(token);
    expect(decryptSecret(cipherText)).toBe(token);
    expect(encryptSecret(token)).not.toBe(cipherText);
  });
  it("fails closed when the encryption key is missing or wrong", () => {
    process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY = "unit-test-encryption-key";
    const cipherText = encryptSecret("a-token");
    process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY = "a-different-key";
    expect(() => decryptSecret(cipherText)).toThrow();
    delete process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY;
    expect(() => encryptSecret("a-token")).toThrow();
    process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY = "unit-test-encryption-key";
  });
});
