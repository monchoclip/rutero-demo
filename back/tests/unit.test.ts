import { describe, it, expect } from "vitest";
import { addCalendarMonth, addCalendarMonths } from "../src/shared/dates.js";
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
import { EventEmitter } from "node:events";
import { execFileSync } from "node:child_process";
import {
  calculateQuote,
  defaultBillingConfig,
  wompiIntegritySignature,
} from "../src/billing/BillingTypes.js";
import {
  billingConfigSchema,
  simulationSchema,
} from "../src/billing/BillingSchema.js";
import {
  distanceMeters,
  visitEvidenceCapabilities,
  visitVerificationStatus,
} from "../src/crm/VisitTypes.js";
import { EventHub } from "../src/realtime/EventHub.js";
import {
  parseVisitPhotoDataUrl,
  storeVisitPhoto,
  visitPhotoStorageConfigFromEnv,
  type VisitPhotoStorage,
} from "../src/storage/VisitPhotoStorage.js";
import { productSchema, campaignSchema } from "../src/catalog/CatalogSchema.js";

const jpegDataUrl = "data:image/jpeg;base64,/9j/2Q==";
const jpegSha256 =
  "32461d5bd1773012acef0ba15636752949bd7c2ce50f9172159d9f56cf0dd9af";

describe("production preflight", () => {
  const readyEnvironment = {
    NODE_ENV: "production",
    APP_ORIGIN: "https://ruts68.com",
    DATABASE_URL:
      "postgresql://ruts68_app:strong-password@ruts68-prod.cluster.example.com:5432/ruts68_prod",
    META_WEBHOOK_VERIFY_TOKEN: "meta-verify-production-token",
    META_APP_SECRET: "meta-app-secret-production",
    WOMPI_PUBLIC_KEY: "pub_prod_abc",
    WOMPI_INTEGRITY_SECRET: "wompi-integrity-secret",
    WOMPI_EVENTS_SECRET: "wompi-events-secret",
    WHATSAPP_TOKEN_ENCRYPTION_KEY: "Ruts68-production-key-2026-secure!",
    VISIT_PHOTO_STORAGE_MODE: "s3",
    VISIT_PHOTO_S3_BUCKET: "ruts68-production-visits",
    VISIT_PHOTO_S3_REGION: "us-east-1",
    MAIL_TRANSPORT: "ses",
    MAIL_FROM: "recordatorios@ruts68.com",
    AWS_REGION: "us-east-1",
  };

  it("accepts a complete production environment without exposing secret values", () => {
    const output = execFileSync(
      process.execPath,
      ["scripts/preflight-production.mjs"],
      {
        cwd: new URL("../..", import.meta.url),
        env: { ...process.env, ...readyEnvironment },
        encoding: "utf8",
      },
    );
    expect(output).toContain("OK");
    expect(output).not.toContain(readyEnvironment.WOMPI_EVENTS_SECRET);
    expect(output).not.toContain(
      readyEnvironment.WHATSAPP_TOKEN_ENCRYPTION_KEY,
    );
  }, 15000);

  it("rejects local or incomplete settings and reports only variable names", () => {
    let output = "";
    try {
      execFileSync(process.execPath, ["scripts/preflight-production.mjs"], {
        cwd: new URL("../..", import.meta.url),
        env: {
          ...process.env,
          ...readyEnvironment,
          APP_ORIGIN: "http://localhost:3068",
          DATABASE_URL: "postgresql://ruts68:local@127.0.0.1:55468/ruts68_test",
          WOMPI_EVENTS_SECRET: "",
          WHATSAPP_TOKEN_ENCRYPTION_KEY: "unit-test-encryption-key",
          VISIT_PHOTO_STORAGE_MODE: "local",
          MAIL_TRANSPORT: "local",
        },
        encoding: "utf8",
      });
    } catch (error) {
      output = String((error as { stdout?: string }).stdout ?? "");
    }
    expect(output).toContain("APP_ORIGIN");
    expect(output).toContain("DATABASE_URL");
    expect(output).toContain("WOMPI_EVENTS_SECRET");
    expect(output).toContain("WHATSAPP_TOKEN_ENCRYPTION_KEY");
    expect(output).toContain("VISIT_PHOTO_STORAGE_MODE");
    expect(output).toContain("MAIL_TRANSPORT");
    expect(output).toContain("No se imprimieron valores de secretos");
    expect(output).not.toContain("127.0.0.1");
    expect(output).not.toContain("unit-test-encryption-key");
  });

  it("accepts the explicit same-server database profile for the low-cost AWS start", () => {
    const output = execFileSync(
      process.execPath,
      ["scripts/preflight-production.mjs"],
      {
        cwd: new URL("../..", import.meta.url),
        env: {
          ...process.env,
          ...readyEnvironment,
          DATABASE_URL:
            "postgresql://ruts68:strong-password@127.0.0.1:5432/ruts68?schema=public&connection_limit=10",
          DATABASE_LOCATION: "same-server",
        },
        encoding: "utf8",
      },
    );
    expect(output).toContain("OK");
    expect(output).toContain("DATABASE_LOCATION");
  }, 15000);

  it("still rejects test databases even when the server profile is explicit", () => {
    let output = "";
    try {
      execFileSync(process.execPath, ["scripts/preflight-production.mjs"], {
        cwd: new URL("../..", import.meta.url),
        env: {
          ...process.env,
          ...readyEnvironment,
          DATABASE_URL:
            "postgresql://ruts68:strong-password@127.0.0.1:5432/ruts68_test",
          DATABASE_LOCATION: "same-server",
        },
        encoding: "utf8",
      });
    } catch (error) {
      output = String((error as { stdout?: string }).stdout ?? "");
    }
    expect(output).toContain("DATABASE_URL");
    expect(output).toContain("base reservada para pruebas");
    expect(output).not.toContain("127.0.0.1");
  });

  it("accepts a launch that declares the integrations it has no credentials for", () => {
    // El backend falla cerrado sin esos secretos: el webhook de Meta responde
    // 503 y el de Wompi 404. Publicar sin ellos es valido si la ausencia es una
    // decision declarada, y la salida tiene que decir cuales quedaron apagadas.
    const sinCredenciales = { ...readyEnvironment };
    for (const key of [
      "META_WEBHOOK_VERIFY_TOKEN",
      "META_APP_SECRET",
      "WOMPI_PUBLIC_KEY",
      "WOMPI_INTEGRITY_SECRET",
      "WOMPI_EVENTS_SECRET",
    ])
      delete (sinCredenciales as Record<string, string>)[key];

    const output = execFileSync(
      process.execPath,
      ["scripts/preflight-production.mjs"],
      {
        cwd: new URL("../..", import.meta.url),
        env: {
          ...process.env,
          ...sinCredenciales,
          DISABLED_INTEGRATIONS: "whatsapp,wompi",
        },
        encoding: "utf8",
      },
    );
    expect(output).toContain("OK");
    expect(output).toContain("whatsapp");
    expect(output).toContain("wompi");
  });

  it("keeps requiring the secrets of an integration that was not declared disabled", () => {
    const sinWompi = { ...readyEnvironment } as Record<string, string>;
    delete sinWompi.WOMPI_EVENTS_SECRET;
    delete sinWompi.META_APP_SECRET;
    let output = "";
    try {
      execFileSync(process.execPath, ["scripts/preflight-production.mjs"], {
        cwd: new URL("../..", import.meta.url),
        // Solo se declara whatsapp: los secretos de Wompi siguen exigidos.
        env: { ...process.env, ...sinWompi, DISABLED_INTEGRATIONS: "whatsapp" },
        encoding: "utf8",
      });
    } catch (error) {
      output = String((error as { stdout?: string }).stdout ?? "");
    }
    expect(output).toContain("ERROR");
    expect(output).toContain("WOMPI_EVENTS_SECRET");
    expect(output).not.toContain("META_APP_SECRET");
  });

  it("rejects an unknown integration name instead of silently ignoring it", () => {
    let output = "";
    try {
      execFileSync(process.execPath, ["scripts/preflight-production.mjs"], {
        cwd: new URL("../..", import.meta.url),
        env: {
          ...process.env,
          ...readyEnvironment,
          DISABLED_INTEGRATIONS: "whatsap",
        },
        encoding: "utf8",
      });
    } catch (error) {
      output = String((error as { stdout?: string }).stdout ?? "");
    }
    expect(output).toContain("DISABLED_INTEGRATIONS");
    expect(output).toContain("whatsap");
  });

  it("still rejects a malformed or non-postgresql url when the server profile is explicit", () => {
    // El perfil same-server declara una topologia; no puede convertirse en un
    // interruptor que apague la validacion de la cadena de conexion.
    for (const invalida of [
      "no-es-una-url",
      "mysql://ruts68@127.0.0.1/ruts68",
    ]) {
      let output = "";
      try {
        execFileSync(process.execPath, ["scripts/preflight-production.mjs"], {
          cwd: new URL("../..", import.meta.url),
          env: {
            ...process.env,
            ...readyEnvironment,
            DATABASE_URL: invalida,
            DATABASE_LOCATION: "same-server",
          },
          encoding: "utf8",
        });
      } catch (error) {
        output = String((error as { stdout?: string }).stdout ?? "");
      }
      expect(output).toContain("ERROR");
      expect(output).toContain("DATABASE_URL");
    }
  });
});

describe("catalog date validation", () => {
  it("rejects product validity ranges that end before they start", () => {
    expect(
      productSchema.safeParse({
        code: "A",
        name: "Producto",
        priceMinor: 100,
        validFrom: "2026-01-02T00:00:00Z",
        validTo: "2026-01-01T00:00:00Z",
      }).success,
    ).toBe(false);
  });
  it("rejects campaign ranges that end before they start", () => {
    expect(
      campaignSchema.safeParse({
        name: "Campaña",
        startsAt: "2026-01-02T00:00:00Z",
        endsAt: "2026-01-01T00:00:00Z",
        productIds: [],
      }).success,
    ).toBe(false);
  });
});

function fakeReply() {
  const chunks: string[] = [];
  const raw = new EventEmitter() as EventEmitter & {
    writeHead: (status: number, headers: Record<string, string>) => void;
    write: (chunk: string) => void;
  };
  raw.writeHead = (status, headers) => {
    chunks.push(`status:${status}`);
    chunks.push(headers["Content-Type"]);
  };
  raw.write = (chunk) => {
    chunks.push(chunk);
  };
  return {
    chunks,
    code(status: number) {
      chunks.push(`code:${status}`);
      return this;
    },
    send(payload: unknown) {
      chunks.push(JSON.stringify(payload));
      return this;
    },
    hijack() {
      chunks.push("hijacked");
      return this;
    },
    raw,
  };
}

describe("realtime event hub", () => {
  const actor = (organizationId: string | null): Actor => ({
    id: "user",
    organizationId,
    role: "commercial_coordinator",
    name: "Usuario",
    email: "user@example.test",
  });

  it("streams only events for the subscriber organization", () => {
    const hub = new EventHub();
    const alpha = fakeReply();
    const beta = fakeReply();
    hub.subscribe(actor("alpha"), alpha as never);
    hub.subscribe(actor("beta"), beta as never);
    expect(alpha.chunks).toContain("hijacked");
    hub.publish({
      organizationId: "alpha",
      type: "activity.created",
      resourceId: "activity-1",
    });
    hub.publish({
      organizationId: "beta",
      type: "membership.updated",
      resourceId: "payment-1",
    });
    expect(alpha.chunks.join("")).toContain("activity.created");
    expect(alpha.chunks.join("")).not.toContain("payment-1");
    expect(beta.chunks.join("")).toContain("membership.updated");
    expect(beta.chunks.join("")).not.toContain("activity-1");
    alpha.raw.emit("close");
    beta.raw.emit("close");
    hub.close();
  });

  it("rejects platform users without a tenant context", () => {
    const hub = new EventHub();
    const reply = fakeReply();
    hub.subscribe(actor(null), reply as never);
    expect(reply.chunks.join("")).toContain("TENANT_REQUIRED");
  });
});
describe("visit photo storage metadata", () => {
  it("builds a storage key, hash and size from an image data URL", async () => {
    const photo = await storeVisitPhoto({
      organizationId: "org-1",
      activityId: "act-1",
      dataUrl: jpegDataUrl,
    });
    expect(photo.storageKey).toBe(
      `organizations/org-1/visits/act-1/${jpegSha256}.jpg`,
    );
    expect(photo.contentType).toBe("image/jpeg");
    expect(photo.sizeBytes).toBe(4);
    expect(photo.dataUrl).toContain("data:image/jpeg;base64");
  });
  it("rejects data URLs whose decoded bytes do not match the declared image type", () => {
    expect(() =>
      parseVisitPhotoDataUrl("data:image/jpeg;base64,aGVsbG8="),
    ).toThrow("bytes reales");
    expect(() =>
      parseVisitPhotoDataUrl("data:image/png;base64,/9j/2Q=="),
    ).toThrow("bytes reales");
  });
  it("requires explicit S3 photo storage in production", () => {
    const previous = {
      nodeEnv: process.env.NODE_ENV,
      mode: process.env.VISIT_PHOTO_STORAGE_MODE,
      bucket: process.env.VISIT_PHOTO_S3_BUCKET,
      region: process.env.VISIT_PHOTO_S3_REGION,
      awsRegion: process.env.AWS_REGION,
    };
    try {
      process.env.NODE_ENV = "production";
      delete process.env.VISIT_PHOTO_STORAGE_MODE;
      expect(() => visitPhotoStorageConfigFromEnv()).toThrow(
        "VISIT_PHOTO_STORAGE_MODE=s3 is required in production",
      );
      process.env.VISIT_PHOTO_STORAGE_MODE = "local";
      expect(() => visitPhotoStorageConfigFromEnv()).toThrow(
        "VISIT_PHOTO_STORAGE_MODE=s3 is required in production",
      );
      process.env.VISIT_PHOTO_STORAGE_MODE = "s3";
      delete process.env.VISIT_PHOTO_S3_BUCKET;
      expect(() => visitPhotoStorageConfigFromEnv()).toThrow(
        "VISIT_PHOTO_S3_BUCKET is required",
      );
      process.env.VISIT_PHOTO_S3_BUCKET = "ruts68-test";
      delete process.env.VISIT_PHOTO_S3_REGION;
      delete process.env.AWS_REGION;
      expect(() => visitPhotoStorageConfigFromEnv()).toThrow(
        "VISIT_PHOTO_S3_REGION or AWS_REGION is required",
      );
      process.env.VISIT_PHOTO_S3_REGION = "us-east-1";
      expect(visitPhotoStorageConfigFromEnv()).toMatchObject({
        mode: "s3",
        bucket: "ruts68-test",
        region: "us-east-1",
      });
    } finally {
      restoreEnv("NODE_ENV", previous.nodeEnv);
      restoreEnv("VISIT_PHOTO_STORAGE_MODE", previous.mode);
      restoreEnv("VISIT_PHOTO_S3_BUCKET", previous.bucket);
      restoreEnv("VISIT_PHOTO_S3_REGION", previous.region);
      restoreEnv("AWS_REGION", previous.awsRegion);
    }
  });
  it("supports an external storage adapter without keeping the binary in row data", async () => {
    const calls: string[] = [];
    const storage: VisitPhotoStorage = {
      async store(input) {
        calls.push(input.dataUrl);
        return {
          storageKey: "organizations/org-1/visits/act-1/photo.jpg",
          sha256: "abc",
          contentType: "image/jpeg",
          sizeBytes: 5,
        };
      },
      async authorizeDownload(input) {
        return {
          mode: "redirect",
          url: `https://storage.example.test/${input.storageKey}?signature=test`,
          expiresInSeconds: 300,
        };
      },
      async delete(storageKey) {
        calls.push(`delete:${storageKey}`);
      },
    };
    const photo = await storeVisitPhoto({
      organizationId: "org-1",
      activityId: "act-1",
      dataUrl: jpegDataUrl,
      storage,
    });
    const download = await storage.authorizeDownload({
      storageKey: photo.storageKey,
      contentType: photo.contentType,
      sizeBytes: photo.sizeBytes,
    });
    await storage.delete(photo.storageKey);
    expect(photo.dataUrl).toBeUndefined();
    expect(download).toMatchObject({
      mode: "redirect",
      expiresInSeconds: 300,
    });
    expect(calls).toEqual([
      jpegDataUrl,
      "delete:organizations/org-1/visits/act-1/photo.jpg",
    ]);
  });
});

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
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
  it("adds multiple months from the original day", () => {
    const original = new Date("2026-01-31T14:10:00.000Z");
    expect(addCalendarMonths(original, 2).toISOString()).toBe(
      "2026-03-31T14:10:00.000Z",
    );
    expect(() => addCalendarMonths(original, 0)).toThrow();
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
  it("exposes browser capture without implying active background tracking", () => {
    expect(visitEvidenceCapabilities).toEqual({
      location: "available",
      photo: "available",
      realtime: "not_configured",
    });
    expect(
      visitVerificationStatus({ type: "visit", status: "scheduled" }),
    ).toBe("planned");
    expect(
      visitVerificationStatus({
        type: "visit",
        status: "scheduled",
        visitStartedAt: new Date(),
      }),
    ).toBe("in_progress");
    expect(
      visitVerificationStatus({ type: "visit", status: "completed" }),
    ).toBe("closed_without_evidence");
    expect(
      visitVerificationStatus({
        type: "visit",
        status: "completed",
        visitStartedAt: new Date(),
        visitStartLatitude: 4.71098,
        visitStartLongitude: -74.07209,
        visitFinishedAt: new Date(),
        visitEndLatitude: 4.711,
        visitEndLongitude: -74.072,
        visitPhotoDataUrl: jpegDataUrl,
        visitDistanceMeters: 12,
      }),
    ).toBe("verified");
    expect(
      visitVerificationStatus({
        type: "visit",
        status: "completed",
        visitStartedAt: new Date(),
        visitStartLatitude: 4.71098,
        visitStartLongitude: -74.07209,
        visitFinishedAt: new Date(),
        visitEndLatitude: 4.711,
        visitEndLongitude: -74.072,
        visitPhotoDataUrl: null,
        visitPhotoStorageKey: "organizations/org/visits/visit/photo.jpg",
        visitPhotoSha256: jpegSha256,
        visitPhotoContentType: "image/jpeg",
        visitPhotoSizeBytes: 4,
        visitDistanceMeters: 12,
      }),
    ).toBe("verified");
    expect(
      visitVerificationStatus({
        type: "visit",
        status: "completed",
        visitStartedAt: new Date(),
        visitStartLatitude: 4.71098,
        visitStartLongitude: -74.07209,
        visitFinishedAt: new Date(),
        visitEndLatitude: 4.72,
        visitEndLongitude: -74.08,
        visitPhotoDataUrl: jpegDataUrl,
        visitDistanceMeters: 1200,
      }),
    ).toBe("out_of_range");
    expect(visitVerificationStatus({ type: "call", status: "scheduled" })).toBe(
      null,
    );
    expect(
      distanceMeters(
        { latitude: 4.71098, longitude: -74.07209 },
        {
          latitude: 4.711,
          longitude: -74.072,
        },
      ),
    ).toBeLessThan(20);
  });
});
describe("Wompi checkout integrity", () => {
  it("generates the SHA256 signature from reference, amount, currency and secret", () => {
    expect(
      wompiIntegritySignature("RUTS68-ABC", 2490000, "COP", "test_secret"),
    ).toBe("5838551209fe8a6962370e2f6e15f442bc85a53160dd2ba9772318c4d0add0bf");
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
