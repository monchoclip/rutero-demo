import { z } from "zod";
const money = z.number().int().min(0).max(100_000_000);
const rate = z.number().int().min(0).max(10_000);
export const planSchema = z
  .object({
    id: z.enum(["essential", "growth", "enterprise"]),
    name: z.string().trim().min(2).max(60),
    baseMinor: money,
    includedUsers: z.number().int().min(1).max(500),
    userMinor: money,
  })
  .strict();
export const billingConfigSchema = z
  .object({
    mode: z.literal("simulation"),
    currency: z.literal("COP"),
    trialMonths: z.number().int().min(1).max(12),
    supportFixedMinor: money,
    supportBps: rate,
    gatewayFixedMinor: money,
    gatewayBps: rate,
    taxBps: rate,
    plans: z
      .array(planSchema)
      .length(3)
      .refine(
        (plans) => new Set(plans.map((plan) => plan.id)).size === 3,
        "Los planes no pueden repetirse.",
      ),
  })
  .strict();
export const settingsSchema = z
  .object({
    version: z.number().int().positive(),
    configuration: billingConfigSchema,
  })
  .strict();
export const quoteSchema = z
  .object({
    planId: z.enum(["essential", "growth", "enterprise"]),
    users: z.number().int().min(1).max(500),
  })
  .strict();
export const simulationSchema = quoteSchema.extend({
  expectedVersion: z.number().int().positive(),
  outcome: z.enum(["approved", "declined", "pending"]),
  idempotencyKey: z.uuid(),
});
export type BillingConfig = z.infer<typeof billingConfigSchema>;
export type QuoteInput = z.infer<typeof quoteSchema>;
export type SimulationInput = z.infer<typeof simulationSchema>;
