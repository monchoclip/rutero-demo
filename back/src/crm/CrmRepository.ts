import type { PrismaClient, Prisma } from "@prisma/client";
import type { Actor } from "../identity/IdentityTypes.js";
import { scope, activityScope, tenantId } from "./CrmTypes.js";
import { AppError } from "../shared/errors.js";
import type { ModuleConfig } from "./OrganizationSchema.js";
const userSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  active: true,
} as const;
export type PageQuery = {
  cursor?: string;
  search: string;
  limit: number;
  advisorId?: string;
  status?: "scheduled" | "completed" | "cancelled" | "all";
};
export class CrmRepository {
  constructor(private db: PrismaClient) {}
  organization(actor: Actor) {
    return this.db.organization.findUniqueOrThrow({
      where: { id: tenantId(actor) },
    });
  }
  platformUpdateModules(
    actor: Actor,
    organizationId: string,
    modules: ModuleConfig,
  ) {
    return this.db.$transaction(async (tx) => {
      const organization = await tx.organization.findUnique({
        where: { id: organizationId },
      });
      if (!organization) return null;
      const updated = await tx.organization.update({
        where: { id: organizationId },
        data: { moduleConfig: modules },
      });
      await tx.auditEvent.create({
        data: {
          organizationId,
          actorId: actor.id,
          action: "organization.modules.updated",
          resourceId: organizationId,
        },
      });
      return updated.moduleConfig;
    });
  }
  users(actor: Actor) {
    return this.db.user.findMany({
      where: {
        organizationId: tenantId(actor),
        ...(actor.role === "advisor" ? { id: actor.id } : {}),
      },
      select: userSelect,
      orderBy: { name: "asc" },
    });
  }
  advisor(actor: Actor, id: string) {
    return this.db.user.findFirst({
      where: {
        id,
        organizationId: tenantId(actor),
        role: "advisor",
        active: true,
      },
    });
  }
  client(actor: Actor, id: string) {
    return this.db.client.findFirst({
      where: { id, ...scope(actor) },
      include: { advisor: { select: userSelect } },
    });
  }
  clients(actor: Actor, query: PageQuery) {
    const search = query.search.trim();
    return this.db.client.findMany({
      where: {
        ...scope(actor),
        ...(query.advisorId && query.advisorId !== "all"
          ? { advisorId: query.advisorId }
          : {}),
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: "insensitive" } },
                { contactName: { contains: search, mode: "insensitive" } },
                { city: { contains: search, mode: "insensitive" } },
                { phone: { contains: search, mode: "insensitive" } },
                { email: { contains: search, mode: "insensitive" } },
              ],
            }
          : {}),
        ...(query.cursor ? { id: { gt: query.cursor } } : {}),
      },
      include: { advisor: { select: userSelect } },
      orderBy: { id: "asc" },
      take: query.limit + 1,
    });
  }
  createClient(
    actor: Actor,
    data: {
      name: string;
      contactName: string;
      email?: string;
      phone: string;
      city: string;
      notes: string;
      advisorId: string;
    },
  ) {
    return this.db.$transaction(async (tx) => {
      const client = await tx.client.create({
        data: {
          ...data,
          email: data.email || null,
          organizationId: tenantId(actor),
        },
      });
      await this.audit(tx, actor, "client.created", client.id);
      const linked = await tx.whatsAppConversation.updateMany({
        where: {
          organizationId: tenantId(actor),
          contactPhone: data.phone,
          clientId: null,
        },
        data: { clientId: client.id },
      });
      if (linked.count)
        await this.audit(tx, actor, "client.linked_from_whatsapp", client.id);
      return client;
    });
  }
  reassign(actor: Actor, id: string, advisorId: string) {
    return this.db.$transaction(async (tx) => {
      const result = await tx.client.updateMany({
        where: { id, ...scope(actor) },
        data: { advisorId },
      });
      if (!result.count) return null;
      const advisor = await tx.user.findUniqueOrThrow({
        where: { id: advisorId },
      });
      await tx.emailJob.updateMany({
        where: {
          organizationId: tenantId(actor),
          activity: { clientId: id, status: "scheduled" },
          sentAt: null,
        },
        data: { recipient: advisor.email },
      });
      await tx.activity.updateMany({
        where: {
          organizationId: tenantId(actor),
          clientId: id,
          status: "scheduled",
        },
        data: { advisorId },
      });
      await this.audit(tx, actor, "client.reassigned", id);
      return tx.client.findUnique({ where: { id } });
    });
  }
  invitations(actor: Actor) {
    return this.db.invitation.findMany({
      where: {
        organizationId: tenantId(actor),
        acceptedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: { id: true, name: true, email: true, expiresAt: true },
      orderBy: { createdAt: "desc" },
    });
  }
  invite(
    actor: Actor,
    data: { name: string; email: string; tokenHash: string; expiresAt: Date },
    body: string,
  ) {
    return this.db.$transaction(async (tx) => {
      const invitation = await tx.invitation.create({
        data: { ...data, organizationId: tenantId(actor) },
      });
      await tx.emailJob.create({
        data: {
          organizationId: tenantId(actor),
          recipient: data.email,
          subject: "Tu invitación a Ruts68",
          body,
          availableAt: new Date(),
        },
      });
      await this.audit(tx, actor, "user.invited", invitation.id);
      return {
        id: invitation.id,
        name: invitation.name,
        email: invitation.email,
        expiresAt: invitation.expiresAt,
      };
    });
  }
  async activities(actor: Actor, query: PageQuery) {
    const cursor = query.cursor
      ? await this.db.activity.findFirst({
          where: { id: query.cursor, ...activityScope(actor) },
          select: { id: true, dueAt: true },
        })
      : null;
    const search = query.search.trim();
    return this.db.activity.findMany({
      where: {
        ...activityScope(actor),
        ...(query.advisorId && query.advisorId !== "all"
          ? { advisorId: query.advisorId }
          : {}),
        ...(query.status && query.status !== "all"
          ? { status: query.status }
          : {}),
        ...(search
          ? {
              OR: [
                { notes: { contains: search, mode: "insensitive" } },
                { outcome: { contains: search, mode: "insensitive" } },
                { client: { name: { contains: search, mode: "insensitive" } } },
                {
                  client: {
                    contactName: { contains: search, mode: "insensitive" },
                  },
                },
                {
                  advisor: { name: { contains: search, mode: "insensitive" } },
                },
              ],
            }
          : {}),
        ...(cursor
          ? {
              OR: [
                { dueAt: { gt: cursor.dueAt } },
                { dueAt: cursor.dueAt, id: { gt: cursor.id } },
              ],
            }
          : {}),
      },
      include: {
        client: { select: { name: true } },
        advisor: { select: userSelect },
      },
      orderBy: [{ dueAt: "asc" }, { id: "asc" }],
      take: query.limit + 1,
    });
  }
  activity(actor: Actor, id: string) {
    return this.db.activity.findFirst({
      where: { id, ...activityScope(actor) },
    });
  }
  startVisit(
    actor: Actor,
    id: string,
    data: {
      startedAt: Date;
      latitude: number;
      longitude: number;
      accuracy: number;
      address?: string;
    },
  ) {
    return this.db.$transaction(async (tx) => {
      const result = await tx.activity.updateMany({
        where: {
          id,
          ...activityScope(actor),
          status: "scheduled",
          type: "visit",
          visitStartedAt: null,
        },
        data: {
          visitStartedAt: data.startedAt,
          visitStartLatitude: data.latitude,
          visitStartLongitude: data.longitude,
          visitStartAccuracy: data.accuracy,
          visitStartAddress: data.address,
        },
      });
      if (!result.count) return null;
      await this.audit(tx, actor, "visit.started", id);
      return tx.activity.findUnique({ where: { id } });
    });
  }
  byKey(actor: Actor, idempotencyKey: string) {
    return this.db.activity.findFirst({
      where: { ...activityScope(actor), idempotencyKey },
    });
  }
  createActivity(
    actor: Actor,
    data: {
      clientId: string;
      advisorId: string;
      type: "call" | "visit" | "follow_up";
      dueAt: Date;
      notes: string;
      idempotencyKey: string;
    },
    recipient: string,
    clientName: string,
  ) {
    return this.db.$transaction(async (tx) => {
      const locked = await tx.client.updateMany({
        where: {
          id: data.clientId,
          ...scope(actor),
          advisorId: data.advisorId,
        },
        data: { updatedAt: new Date() },
      });
      if (!locked.count)
        throw new AppError(
          409,
          "ASSIGNMENT_CHANGED",
          "La asignación cambió. Actualiza la cartera antes de programar.",
        );
      const activity = await tx.activity.create({
        data: { ...data, organizationId: tenantId(actor) },
      });
      await tx.emailJob.create({
        data: {
          organizationId: tenantId(actor),
          activityId: activity.id,
          recipient,
          subject: `Seguimiento: ${clientName}`,
          body: `Tienes una actividad con ${clientName} programada para ${data.dueAt.toISOString()}. Consulta tu agenda en Ruts68.`,
          availableAt: new Date(
            Math.max(Date.now(), data.dueAt.getTime() - 900_000),
          ),
        },
      });
      await this.audit(tx, actor, "activity.scheduled", activity.id);
      return activity;
    });
  }
  complete(
    actor: Actor,
    id: string,
    data: {
      outcome: string;
      notes: string;
      durationSeconds: number;
      visitStartedAt?: Date;
      visitStartLatitude?: number;
      visitStartLongitude?: number;
      visitStartAccuracy?: number;
      visitStartAddress?: string;
      visitFinishedAt?: Date;
      visitEndLatitude?: number;
      visitEndLongitude?: number;
      visitEndAccuracy?: number;
      visitPhotoDataUrl?: string;
      visitPhotoStorageKey?: string;
      visitPhotoSha256?: string;
      visitPhotoContentType?: string;
      visitPhotoSizeBytes?: number;
      visitDistanceMeters?: number;
    },
    followUp?: {
      dueAt: Date;
      clientId: string;
      advisorId: string;
      recipient: string;
    },
  ) {
    return this.db.$transaction(async (tx) => {
      const result = await tx.activity.updateMany({
        where: { id, ...activityScope(actor), status: "scheduled" },
        data: { ...data, status: "completed", completedAt: new Date() },
      });
      if (!result.count) return null;
      await tx.emailJob.updateMany({
        where: { activityId: id, sentAt: null },
        data: { cancelledAt: new Date() },
      });
      if (followUp) await this.createFollowUp(tx, actor, id, followUp);
      await this.audit(tx, actor, "activity.completed", id);
      return tx.activity.findUnique({ where: { id } });
    });
  }
  private async createFollowUp(
    tx: Prisma.TransactionClient,
    actor: Actor,
    id: string,
    input: {
      dueAt: Date;
      clientId: string;
      advisorId: string;
      recipient: string;
    },
  ) {
    const activity = await tx.activity.create({
      data: {
        organizationId: tenantId(actor),
        clientId: input.clientId,
        advisorId: input.advisorId,
        dueAt: input.dueAt,
        type: "follow_up",
        notes: "Seguimiento de la gestión anterior",
        idempotencyKey: `follow-up:${id}`,
      },
    });
    await tx.emailJob.create({
      data: {
        organizationId: tenantId(actor),
        activityId: activity.id,
        recipient: input.recipient,
        subject: "Recordatorio de seguimiento",
        body: `Tienes un seguimiento programado para ${input.dueAt.toISOString()}. Consulta tu agenda en Ruts68.`,
        availableAt: new Date(
          Math.max(Date.now(), input.dueAt.getTime() - 900_000),
        ),
      },
    });
  }
  history(actor: Actor, clientId: string) {
    return this.db.activity.findMany({
      where: { organizationId: tenantId(actor), clientId },
      include: { advisor: { select: userSelect } },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }
  mailbox(actor: Actor) {
    return this.db.emailJob.findMany({
      where: {
        organizationId: tenantId(actor),
        ...(actor.role === "advisor"
          ? {
              recipient: actor.email,
              OR: [
                { activityId: null },
                { activity: { client: { advisorId: actor.id } } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        recipient: true,
        subject: true,
        body: true,
        availableAt: true,
        sentAt: true,
        cancelledAt: true,
        attempts: true,
      },
    });
  }
  private audit(
    tx: Prisma.TransactionClient,
    actor: Actor,
    action: string,
    resourceId: string,
  ) {
    return tx.auditEvent.create({
      data: {
        organizationId: tenantId(actor),
        actorId: actor.id,
        action,
        resourceId,
      },
    });
  }
}
