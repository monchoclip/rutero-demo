import type { Handler } from "../../shared/context.js";
import { BillingService } from "../BillingService.js";
import {
  checkoutSchema,
  idempotencyReferenceSchema,
  quoteSchema,
  settingsSchema,
  simulationSchema,
} from "../BillingSchema.js";
export function billingHandlers(
  billing: BillingService,
): Record<string, Handler> {
  return {
    billingSettings: async (r) => billing.settings(r.actor!),
    updateBillingSettings: async (r) => {
      const input = settingsSchema.parse(r.body);
      return billing.update(r.actor!, input.version, input.configuration);
    },
    billingQuote: async (r) =>
      billing.quote(r.actor!, quoteSchema.parse(r.body)),
    billingCheckout: async (r, reply) => {
      const result = await billing.checkout(
        r.actor!,
        checkoutSchema.parse(r.body),
      );
      reply.code(201);
      return result;
    },
    billingPayment: async (r) =>
      billing.payment(
        r.actor!,
        idempotencyReferenceSchema.parse(r.params).reference,
      ),
    billingSimulate: async (r, reply) => {
      const result = await billing.simulate(
        r.actor!,
        simulationSchema.parse(r.body),
      );
      reply.code(201);
      return result;
    },
    billingHistory: async (r) => billing.history(r.actor!),
    platformOrganizations: async (r) => billing.platformOrganizations(r.actor!),
    wompiWebhookEvents: async (r) => billing.wompiEvent(r.body),
  };
}
