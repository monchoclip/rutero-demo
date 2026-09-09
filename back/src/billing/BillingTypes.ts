import type { BillingConfig, QuoteInput } from "./BillingSchema.js";
import { AppError } from "../shared/errors.js";
import { createHash, randomUUID } from "node:crypto";
export const DEMO_ORGANIZATION_ID = "68000000-0000-4000-8000-000000000001";
export const defaultBillingConfig: BillingConfig = {
  mode: "simulation",
  currency: "COP",
  trialMonths: 1,
  supportFixedMinor: 0,
  supportBps: 500,
  gatewayFixedMinor: 90000,
  gatewayBps: 290,
  taxBps: 0,
  plans: [
    {
      id: "essential",
      name: "Esencial",
      baseMinor: 4900000,
      includedUsers: 2,
      userMinor: 1900000,
    },
    {
      id: "growth",
      name: "Crecimiento",
      baseMinor: 12900000,
      includedUsers: 5,
      userMinor: 1500000,
    },
    {
      id: "enterprise",
      name: "Organización",
      baseMinor: 24900000,
      includedUsers: 10,
      userMinor: 1200000,
    },
  ],
};
export function paymentReference() {
  return `RUTS68-${randomUUID().replaceAll("-", "").slice(0, 24).toUpperCase()}`;
}
export function wompiIntegritySignature(
  reference: string,
  amountInCents: number,
  currency: string,
  secret: string,
) {
  return createHash("sha256")
    .update(`${reference}${amountInCents}${currency}${secret}`)
    .digest("hex");
}
const percentage = (amount: number, basisPoints: number) =>
  Number((BigInt(amount) * BigInt(basisPoints) + 9999n) / 10000n);
export function calculateQuote(config: BillingConfig, input: QuoteInput) {
  const plan = config.plans.find((plan) => plan.id === input.planId);
  if (!plan)
    throw new AppError(422, "INVALID_PLAN", "Selecciona un plan válido.");
  const additionalUsers = Math.max(0, input.users - plan.includedUsers);
  const extraUsersMinor = additionalUsers * plan.userMinor;
  const subtotalMinor = plan.baseMinor + extraUsersMinor;
  const supportMinor =
    config.supportFixedMinor + percentage(subtotalMinor, config.supportBps);
  const gatewayMinor =
    config.gatewayFixedMinor +
    percentage(subtotalMinor + supportMinor, config.gatewayBps);
  const taxMinor = percentage(supportMinor + gatewayMinor, config.taxBps);
  return {
    mode: "simulation" as const,
    currency: config.currency,
    planId: plan.id,
    planName: plan.name,
    users: input.users,
    includedUsers: plan.includedUsers,
    additionalUsers,
    baseMinor: plan.baseMinor,
    extraUsersMinor,
    subtotalMinor,
    supportMinor,
    gatewayMinor,
    taxMinor,
    totalMinor: subtotalMinor + supportMinor + gatewayMinor + taxMinor,
  };
}
