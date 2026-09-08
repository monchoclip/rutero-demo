import type { Handler } from "../../shared/context.js";
import { BillingService } from "../BillingService.js";
import {
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
    billingSimulate: async (r, reply) => {
      const result = await billing.simulate(
        r.actor!,
        simulationSchema.parse(r.body),
      );
      reply.code(201);
      return result;
    },
    billingHistory: async (r) => billing.history(r.actor!),
  };
}
