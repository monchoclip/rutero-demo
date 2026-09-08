import type { PrismaClient } from "@prisma/client";
import type { z } from "zod";
import type { registerSchema } from "./IdentitySchema.js";
export class IdentityRepository {
  constructor(private db: PrismaClient) {}
  findByEmail(email: string) {
    return this.db.user.findUnique({ where: { email } });
  }
  register(
    input: z.infer<typeof registerSchema>,
    passwordHash: string,
    trialEndsAt: Date,
  ) {
    return this.db.organization.create({
      data: {
        name: input.companyName,
        sector: input.sector,
        trialEndsAt,
        users: {
          create: {
            name: input.name,
            email: input.email,
            passwordHash,
            role: "commercial_coordinator",
          },
        },
      },
      include: { users: true },
    });
  }
  createSession(userId: string, tokenHash: string, expiresAt: Date) {
    return this.db.session.create({ data: { userId, tokenHash, expiresAt } });
  }
  session(tokenHash: string) {
    return this.db.session.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
  }
  logout(tokenHash: string) {
    return this.db.session.deleteMany({ where: { tokenHash } });
  }
  async attempt(id: string, now: Date) {
    return this.db.$transaction(async (tx) => {
      await tx.authAttempt.deleteMany({ where: { id, resetAt: { lte: now } } });
      return tx.authAttempt.upsert({
        where: { id },
        create: { id, resetAt: new Date(now.getTime() + 600_000) },
        update: { attempts: { increment: 1 } },
      });
    });
  }
  invitation(tokenHash: string) {
    return this.db.invitation.findUnique({ where: { tokenHash } });
  }
  accept(
    invitation: {
      id: string;
      organizationId: string;
      name: string;
      email: string;
    },
    passwordHash: string,
  ) {
    return this.db.$transaction(async (tx) => {
      const claimed = await tx.invitation.updateMany({
        where: {
          id: invitation.id,
          acceptedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { acceptedAt: new Date() },
      });
      if (!claimed.count) return null;
      const user = await tx.user.create({
        data: {
          organizationId: invitation.organizationId,
          name: invitation.name,
          email: invitation.email,
          passwordHash,
          role: "advisor",
        },
      });
      await tx.auditEvent.create({
        data: {
          organizationId: invitation.organizationId,
          actorId: user.id,
          action: "user.invitation.accepted",
          resourceId: user.id,
        },
      });
      return user;
    });
  }
}
