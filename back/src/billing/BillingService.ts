import type { Actor } from "../identity/IdentityTypes.js";
import { AppError } from "../shared/errors.js";
import { BillingRepository } from "./BillingRepository.js";
import {
  billingConfigSchema,
  type QuoteInput,
  type SimulationInput,
  type BillingConfig,
} from "./BillingSchema.js";
import { calculateQuote, DEMO_ORGANIZATION_ID } from "./BillingTypes.js";
export class BillingService {
  constructor(
    private repository: BillingRepository,
    private enabled: boolean,
  ) {}
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
    return result;
  }
  async quote(actor: Actor, input: QuoteInput) {
    const settings = await this.settings(actor);
    return {
      version: settings.version,
      ...calculateQuote(settings.configuration, input),
    };
  }
  history(actor: Actor) {
    return this.repository.list(this.authorize(actor));
  }
  async simulate(actor: Actor, input: SimulationInput) {
    const organizationId = this.authorize(actor, true);
    const existing = await this.repository.find(
      organizationId,
      input.idempotencyKey,
    );
    if (existing) return this.replay(existing, input);
    const settings = await this.settings(actor);
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
