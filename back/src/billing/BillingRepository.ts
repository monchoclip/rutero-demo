import type { PrismaClient } from "@prisma/client";
import type { BillingConfig, SimulationInput } from "./BillingSchema.js";
import type { calculateQuote } from "./BillingTypes.js";
import type { PaymentTransactionStatus } from "@prisma/client";
export class BillingRepository {
  constructor(private db: PrismaClient) {}
  settings(organizationId: string) {
    return this.db.billingSettings.findUnique({ where: { organizationId } });
  }
  update(
    organizationId: string,
    actorId: string,
    version: number,
    configuration: BillingConfig,
  ) {
    return this.db.$transaction(async (tx) => {
      const changed = await tx.billingSettings.updateMany({
        where: { organizationId, version },
        data: { configuration, version: { increment: 1 } },
      });
      if (!changed.count) return null;
      await tx.auditEvent.create({
        data: {
          organizationId,
          actorId,
          action: "billing.simulation.configured",
          resourceId: organizationId,
        },
      });
      return tx.billingSettings.findUniqueOrThrow({
        where: { organizationId },
      });
    });
  }
  find(organizationId: string, idempotencyKey: string) {
    return this.db.paymentSimulation.findUnique({
      where: {
        organizationId_idempotencyKey: { organizationId, idempotencyKey },
      },
    });
  }
  list(organizationId: string) {
    return this.db.paymentSimulation.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      take: 30,
    });
  }
  create(
    organizationId: string,
    actorId: string,
    input: SimulationInput,
    quote: ReturnType<typeof calculateQuote>,
    configuration: BillingConfig,
  ) {
    return this.db.$transaction(async (tx) => {
      // Conditional update locks settings so a quote cannot race a configuration change.
      const locked = await tx.billingSettings.updateMany({
        where: { organizationId, version: input.expectedVersion },
        data: { updatedAt: new Date() },
      });
      if (!locked.count) return null;
      const payment = await tx.paymentSimulation.create({
        data: {
          organizationId,
          idempotencyKey: input.idempotencyKey,
          configurationVersion: input.expectedVersion,
          outcome: input.outcome,
          snapshot: { quote, configuration },
        },
      });
      await tx.auditEvent.create({
        data: {
          organizationId,
          actorId,
          action: `billing.simulation.${input.outcome}`,
          resourceId: payment.id,
        },
      });
      return payment;
    });
  }
  createTransaction(input: {
    organizationId: string;
    reference: string;
    amountInCents: number;
    currency: string;
    planId: string;
    users: number;
    customerName: string;
    customerEmail: string;
  }) {
    return this.db.paymentTransaction.create({ data: input });
  }
  transaction(reference: string) {
    return this.db.paymentTransaction.findUnique({ where: { reference } });
  }
  updateTransaction(
    reference: string,
    status: PaymentTransactionStatus,
    transactionId: string | null,
    raw: unknown,
  ) {
    return this.db.$transaction(async (tx) => {
      const payment = await tx.paymentTransaction.update({
        where: { reference },
        data: { status, transactionId, raw: raw as object },
      });
      if (status === "approved") {
        const now = new Date();
        const ends = new Date(now);
        ends.setMonth(ends.getMonth() + 1);
        await tx.organization.update({
          where: { id: payment.organizationId },
          data: {
            membershipPlan: payment.planId,
            membershipStatus: "active",
            membershipStartedAt: now,
            membershipEndsAt: ends,
          },
        });
      }
      return payment;
    });
  }
  organizations() {
    return this.db.organization.findMany({
      select: {
        id: true,
        name: true,
        sector: true,
        membershipPlan: true,
        membershipStatus: true,
        membershipStartedAt: true,
        membershipEndsAt: true,
        trialEndsAt: true,
        _count: { select: { users: true, clients: true } },
      },
      orderBy: { name: "asc" },
    });
  }
}
