import { createHash } from "node:crypto";
import type { PaymentTransactionStatus } from "@prisma/client";
import type { Actor } from "../identity/IdentityTypes.js";
import { AppError } from "../shared/errors.js";
import { normalizeModuleConfig } from "../crm/OrganizationSchema.js";
import { BillingRepository } from "./BillingRepository.js";
import {
  billingConfigSchema,
  type CheckoutInput,
  type QuoteInput,
  type SimulationInput,
  type BillingConfig,
} from "./BillingSchema.js";
import {
  calculateQuote,
  DEMO_ORGANIZATION_ID,
  paymentReference,
  wompiIntegritySignature,
} from "./BillingTypes.js";
import type { EventHub } from "../realtime/EventHub.js";
type BillingOptions = {
  origin?: string;
  wompiPublicKey?: string;
  wompiIntegritySecret?: string;
  wompiEventsSecret?: string;
};
export class BillingService {
  constructor(
    private repository: BillingRepository,
    private enabled: boolean,
    private options: BillingOptions = {},
    private realtimeHub?: EventHub,
  ) {}
  private authorizePlatform(actor: Actor) {
    if (actor.role !== "super_admin")
      throw new AppError(403, "FORBIDDEN", "Esta vista requiere plataforma.");
  }
  async platformBillingSettings(actor: Actor) {
    this.authorizePlatform(actor);
    const stored = await this.repository.platformSettings();
    if (!stored)
      throw new AppError(
        404,
        "NOT_CONFIGURED",
        "Los valores por defecto todavía no están configurados.",
      );
    return {
      ...stored,
      configuration: billingConfigSchema.parse(stored.configuration),
    };
  }
  async updatePlatformBillingSettings(
    actor: Actor,
    version: number,
    configuration: BillingConfig,
  ) {
    this.authorizePlatform(actor);
    const result = await this.repository.updatePlatformSettings(
      actor.id,
      version,
      billingConfigSchema.parse(configuration),
    );
    if (!result)
      throw new AppError(
        409,
        "CONFIGURATION_CHANGED",
        "Los valores por defecto cambiaron. Actualiza antes de guardar.",
      );
    return {
      ...result,
      configuration: billingConfigSchema.parse(result.configuration),
    };
  }
  private authorize(actor: Actor, write = false) {
    if (!this.enabled || actor.organizationId !== DEMO_ORGANIZATION_ID)
      throw new AppError(
        404,
        "NOT_FOUND",
        "La simulación está disponible solo en la empresa de demostración local.",
      );
    const permitted = write
      ? ["commercial_coordinator"]
      : ["commercial_coordinator", "administrative_coordinator"];
    if (!permitted.includes(actor.role))
      throw new AppError(
        403,
        "FORBIDDEN",
        "Esta opción requiere un perfil de coordinación.",
      );
    return actor.organizationId;
  }
  private authorizeCompany(actor: Actor, write = false) {
    if (!this.enabled || !actor.organizationId)
      throw new AppError(
        404,
        "NOT_FOUND",
        "La facturación no está disponible para esta empresa.",
      );
    const permitted = write
      ? ["commercial_coordinator"]
      : ["commercial_coordinator", "administrative_coordinator"];
    if (!permitted.includes(actor.role))
      throw new AppError(
        403,
        "FORBIDDEN",
        "Esta opción requiere un perfil de coordinación.",
      );
    return actor.organizationId;
  }
  async settings(actor: Actor) {
    const settings = await this.repository.settings(this.authorize(actor));
    if (!settings)
      throw new AppError(
        404,
        "NOT_CONFIGURED",
        "Ejecuta la preparación de datos de demostración.",
      );
    return {
      ...settings,
      configuration: billingConfigSchema.parse(settings.configuration),
    };
  }
  async update(actor: Actor, version: number, configuration: BillingConfig) {
    const result = await this.repository.update(
      this.authorize(actor, true),
      actor.id,
      version,
      configuration,
    );
    if (!result)
      throw new AppError(
        409,
        "CONFIGURATION_CHANGED",
        "La configuración cambió. Actualiza antes de guardar.",
      );
    this.realtimeHub?.publish({
      organizationId: actor.organizationId!,
      type: "membership.updated",
      resourceId: actor.organizationId!,
    });
    return result;
  }
  async quote(actor: Actor, input: QuoteInput) {
    const settings = await this.settings(actor);
    return {
      version: settings.version,
      ...calculateQuote(settings.configuration, input),
    };
  }
  async checkout(actor: Actor, input: CheckoutInput) {
    const organizationId = this.authorizeCompany(actor, true);
    const stored = await this.repository.settings(organizationId);
    if (!stored)
      throw new AppError(
        404,
        "NOT_CONFIGURED",
        "La facturación aún no está configurada.",
      );
    const settings = {
      ...stored,
      configuration: billingConfigSchema.parse(stored.configuration),
    };
    const quote = {
      version: settings.version,
      ...calculateQuote(settings.configuration, input),
    };
    const reference = paymentReference();
    await this.repository.createTransaction({
      organizationId,
      reference,
      amountInCents: quote.totalMinor,
      currency: quote.currency,
      planId: quote.planId,
      users: quote.users,
      customerName: input.customerName,
      customerEmail: input.customerEmail,
    });
    const configured = Boolean(
      this.options.wompiPublicKey && this.options.wompiIntegritySecret,
    );
    return {
      mode: configured ? ("wompi" as const) : ("simulation" as const),
      reference,
      quote,
      customerData: {
        email: input.customerEmail,
        fullName: input.customerName,
        ...(input.customerPhone ? { phoneNumber: input.customerPhone } : {}),
        ...(input.customerLegalId ? { legalId: input.customerLegalId } : {}),
        ...(input.customerLegalIdType
          ? { legalIdType: input.customerLegalIdType }
          : {}),
      },
      ...(configured
        ? {
            publicKey: this.options.wompiPublicKey,
            signatureIntegrity: wompiIntegritySignature(
              reference,
              quote.totalMinor,
              quote.currency,
              this.options.wompiIntegritySecret!,
            ),
            redirectUrl: `${this.options.origin ?? ""}/app/?payment=${reference}`,
          }
        : {}),
    };
  }
  async payment(actor: Actor, reference: string) {
    const organizationId = this.authorizeCompany(actor);
    const payment = await this.repository.transaction(reference);
    if (!payment || payment.organizationId !== organizationId)
      throw new AppError(404, "NOT_FOUND", "No encontramos ese pago.");
    return payment;
  }
  async wompiEvent(event: unknown) {
    if (!this.options.wompiEventsSecret)
      throw new AppError(404, "NOT_CONFIGURED", "Wompi no está configurado.");
    const parsed = event as {
      event?: string;
      data?: { transaction?: Record<string, unknown> };
      signature?: { properties?: string[]; checksum?: string };
      timestamp?: number;
    };
    if (parsed.event !== "transaction.updated" || !parsed.data?.transaction)
      throw new AppError(400, "INVALID_EVENT", "Evento Wompi no soportado.");
    const properties = parsed.signature?.properties ?? [];
    const checksum = parsed.signature?.checksum;
    if (!checksum || !parsed.timestamp || !properties.length)
      throw new AppError(400, "INVALID_EVENT", "Firma Wompi incompleta.");
    const value = properties
      .map((property) => {
        const path = property.split(".");
        let current: unknown = parsed.data;
        for (const segment of path) {
          if (!current || typeof current !== "object") return "";
          current = (current as Record<string, unknown>)[segment];
        }
        return String(current ?? "");
      })
      .join("");
    const expected = createHash("sha256")
      .update(`${value}${parsed.timestamp}${this.options.wompiEventsSecret}`)
      .digest("hex");
    if (expected.toLowerCase() !== checksum.toLowerCase())
      throw new AppError(401, "INVALID_SIGNATURE", "Firma Wompi inválida.");
    const transaction = parsed.data.transaction;
    const statusMap: Record<string, PaymentTransactionStatus> = {
      APPROVED: "approved",
      DECLINED: "declined",
      ERROR: "error",
      VOIDED: "voided",
    } as const;
    const status = statusMap[String(transaction.status)] ?? "pending";
    const reference = String(transaction.reference ?? "");
    if (!reference)
      throw new AppError(400, "INVALID_EVENT", "Referencia ausente.");
    const result = await this.repository.updateTransaction(
      reference,
      status,
      transaction.id ? String(transaction.id) : null,
      event,
    );
    this.realtimeHub?.publish({
      organizationId: result.organizationId,
      type: "membership.updated",
      resourceId: reference,
    });
    return result;
  }
  async platformOrganizations(actor: Actor) {
    if (actor.role !== "super_admin")
      throw new AppError(403, "FORBIDDEN", "Esta vista requiere plataforma.");
    const organizations = await this.repository.organizations();
    return organizations.map((organization) => ({
      ...organization,
      moduleConfig: normalizeModuleConfig(organization.moduleConfig),
    }));
  }
  history(actor: Actor) {
    return this.repository.list(this.authorize(actor));
  }
  async simulate(actor: Actor, input: SimulationInput) {
    const organizationId = input.reference
      ? this.authorizeCompany(actor, true)
      : this.authorize(actor, true);
    const existing = await this.repository.find(
      organizationId,
      input.idempotencyKey,
    );
    if (existing) return this.replay(existing, input);
    const stored = input.reference
      ? await this.repository.settings(organizationId)
      : await this.settings(actor);
    if (!stored)
      throw new AppError(
        404,
        "NOT_CONFIGURED",
        "La facturación aún no está configurada.",
      );
    const settings = {
      ...stored,
      configuration: billingConfigSchema.parse(stored.configuration),
    };
    if (settings.version !== input.expectedVersion)
      throw new AppError(
        409,
        "CONFIGURATION_CHANGED",
        "Actualiza el resumen con las nuevas tarifas de prueba.",
      );
    const result = await this.repository.create(
      organizationId,
      actor.id,
      input,
      calculateQuote(settings.configuration, input),
      settings.configuration,
    );
    if (!result)
      throw new AppError(
        409,
        "CONFIGURATION_CHANGED",
        "Actualiza el resumen con las nuevas tarifas de prueba.",
      );
    if (input.reference) {
      const transaction = await this.repository.updateTransaction(
        input.reference,
        input.outcome === "approved"
          ? "approved"
          : input.outcome === "declined"
            ? "declined"
            : "pending",
        `simulation:${result.id}`,
        result,
      );
      this.realtimeHub?.publish({
        organizationId: transaction.organizationId,
        type: "membership.updated",
        resourceId: input.reference,
      });
    }
    return result;
  }
  private replay(
    existing: NonNullable<Awaited<ReturnType<BillingRepository["find"]>>>,
    input: SimulationInput,
  ) {
    const snapshot = existing.snapshot as {
      quote: { planId: string; users: number };
    };
    if (
      existing.outcome !== input.outcome ||
      existing.configurationVersion !== input.expectedVersion ||
      snapshot.quote.planId !== input.planId ||
      snapshot.quote.users !== input.users
    )
      throw new AppError(
        409,
        "IDEMPOTENCY_CONFLICT",
        "La solicitud ya fue usada con otros datos.",
      );
    return existing;
  }
}
