import type { z } from "zod";
import type { Actor } from "../identity/IdentityTypes.js";
import { CrmRepository } from "./CrmRepository.js";
import { requireCommercial, requireWriter } from "./CrmTypes.js";
import { AppError, notFound } from "../shared/errors.js";
import { hashToken, newToken } from "../shared/security.js";
import type {
  clientSchema,
  activitySchema,
  completeSchema,
  listSchema,
} from "./CrmSchema.js";
import {
  moduleConfigSchema,
  normalizeModuleConfig,
  type ModuleConfig,
} from "./OrganizationSchema.js";
import { distanceMeters } from "./VisitTypes.js";
export class CrmService {
  constructor(
    private repository: CrmRepository,
    private origin: string,
  ) {}
  organization(actor: Actor) {
    return this.repository.organization(actor).then((organization) => ({
      ...organization,
      moduleConfig: normalizeModuleConfig(organization.moduleConfig),
    }));
  }
  async platformUpdateModules(
    actor: Actor,
    organizationId: string,
    modules: ModuleConfig,
  ) {
    if (actor.role !== "super_admin")
      throw new AppError(403, "FORBIDDEN", "Esta vista requiere plataforma.");
    return (
      (await this.repository.platformUpdateModules(
        actor,
        organizationId,
        moduleConfigSchema.parse(modules),
      )) ?? notFound()
    );
  }
  users(actor: Actor) {
    return this.repository.users(actor);
  }
  async clients(actor: Actor, query: z.infer<typeof listSchema>) {
    await this.ensureVisibleAdvisor(actor, query.advisorId);
    const rows = await this.repository.clients(actor, query);
    return this.page(rows, query.limit);
  }
  async createClient(actor: Actor, data: z.infer<typeof clientSchema>) {
    requireWriter(actor);
    if (actor.role === "advisor" && data.advisorId !== actor.id)
      throw new AppError(
        403,
        "FORBIDDEN",
        "Solo puedes crear clientes para tu cartera.",
      );
    if (!(await this.repository.advisor(actor, data.advisorId)))
      throw new AppError(
        422,
        "INVALID_ADVISOR",
        "Elige un asesor activo de tu empresa.",
      );
    return this.repository.createClient(actor, data);
  }
  async reassign(actor: Actor, id: string, advisorId: string) {
    requireCommercial(actor);
    if (!(await this.repository.client(actor, id))) notFound();
    if (!(await this.repository.advisor(actor, advisorId)))
      throw new AppError(
        422,
        "INVALID_ADVISOR",
        "Elige un asesor activo de tu empresa.",
      );
    return this.repository.reassign(actor, id, advisorId);
  }
  invitations(actor: Actor) {
    requireCommercial(actor);
    return this.repository.invitations(actor);
  }
  async invite(actor: Actor, data: { name: string; email: string }) {
    requireCommercial(actor);
    const token = newToken();
    const url = `${this.origin}/ingresar/?invitation=${token}`;
    return this.repository.invite(
      actor,
      {
        ...data,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + 172_800_000),
      },
      `Hola ${data.name}. Crea tu contraseña para ingresar como asesor: ${url}\nEsta invitación vence en 48 horas.`,
    );
  }
  async activities(actor: Actor, query: z.infer<typeof listSchema>) {
    await this.ensureVisibleAdvisor(actor, query.advisorId);
    const rows = await this.repository.activities(actor, query);
    return this.page(rows, query.limit);
  }
  async createActivity(actor: Actor, input: z.infer<typeof activitySchema>) {
    requireWriter(actor);
    const client = await this.repository.client(actor, input.clientId);
    if (!client) notFound();
    const existing = await this.repository.byKey(actor, input.idempotencyKey);
    if (existing) {
      if (
        existing.clientId !== input.clientId ||
        existing.type !== input.type ||
        existing.notes !== input.notes ||
        existing.dueAt.getTime() !== new Date(input.dueAt).getTime()
      )
        throw new AppError(
          409,
          "IDEMPOTENCY_CONFLICT",
          "Esta solicitud ya se usó con otros datos.",
        );
      return existing;
    }
    const dueAt = new Date(input.dueAt);
    if (dueAt.getTime() < Date.now() - 60_000)
      throw new AppError(
        422,
        "INVALID_DATE",
        "Elige una fecha actual o futura.",
      );
    return this.repository.createActivity(
      actor,
      { ...input, dueAt, advisorId: client.advisorId },
      client.advisor.email,
      client.name,
    );
  }
  async complete(
    actor: Actor,
    id: string,
    input: z.infer<typeof completeSchema>,
  ) {
    requireWriter(actor);
    const activity = await this.repository.activity(actor, id);
    if (!activity) notFound();
    if (activity.status === "completed") return activity;
    if (activity.status !== "scheduled")
      throw new AppError(
        422,
        "INVALID_STATE_TRANSITION",
        "Esta actividad no se puede completar.",
      );
    const client = await this.repository.client(actor, activity.clientId);
    if (!client) notFound();
    const { followUpAt, visitEvidence, ...data } = input;
    if (followUpAt && new Date(followUpAt) <= new Date())
      throw new AppError(
        422,
        "INVALID_DATE",
        "El seguimiento debe ser futuro.",
      );
    if (activity.type === "visit" && !visitEvidence)
      throw new AppError(
        422,
        "VISIT_EVIDENCE_REQUIRED",
        "Para cerrar una visita debes capturar ubicación inicial, ubicación final y fotografía.",
      );
    if (activity.type !== "visit" && visitEvidence)
      throw new AppError(
        422,
        "VISIT_EVIDENCE_NOT_ALLOWED",
        "La evidencia de visita solo aplica a actividades de tipo visita.",
      );
    const visitData = visitEvidence
      ? {
          visitStartedAt: new Date(visitEvidence.start.capturedAt),
          visitStartLatitude: visitEvidence.start.latitude,
          visitStartLongitude: visitEvidence.start.longitude,
          visitStartAccuracy: visitEvidence.start.accuracy,
          visitStartAddress: visitEvidence.start.address,
          visitFinishedAt: new Date(visitEvidence.end.capturedAt),
          visitEndLatitude: visitEvidence.end.latitude,
          visitEndLongitude: visitEvidence.end.longitude,
          visitEndAccuracy: visitEvidence.end.accuracy,
          visitPhotoDataUrl: visitEvidence.photoDataUrl,
          visitDistanceMeters: distanceMeters(
            visitEvidence.start,
            visitEvidence.end,
          ),
        }
      : {};
    const followUp = followUpAt
      ? {
          dueAt: new Date(followUpAt),
          clientId: client.id,
          advisorId: client.advisorId,
          recipient: client.advisor.email,
        }
      : undefined;
    return (
      (await this.repository.complete(
        actor,
        id,
        { ...data, ...visitData },
        followUp,
      )) ?? this.repository.activity(actor, id)
    );
  }
  async startVisit(
    actor: Actor,
    id: string,
    input: {
      latitude: number;
      longitude: number;
      accuracy: number;
      capturedAt: string;
      address?: string;
    },
  ) {
    requireWriter(actor);
    const activity = await this.repository.activity(actor, id);
    if (!activity) notFound();
    if (activity.type !== "visit")
      throw new AppError(
        422,
        "NOT_A_VISIT",
        "Solo las visitas pueden iniciar evidencia de ubicación.",
      );
    if (activity.status !== "scheduled")
      throw new AppError(
        422,
        "INVALID_STATE_TRANSITION",
        "Esta visita ya no se puede iniciar.",
      );
    if (activity.visitStartedAt) return activity;
    return (
      (await this.repository.startVisit(actor, id, {
        startedAt: new Date(input.capturedAt),
        latitude: input.latitude,
        longitude: input.longitude,
        accuracy: input.accuracy,
        address: input.address,
      })) ?? this.repository.activity(actor, id)
    );
  }
  async history(actor: Actor, clientId: string) {
    if (!(await this.repository.client(actor, clientId))) notFound();
    return this.repository.history(actor, clientId);
  }
  mailbox(actor: Actor) {
    return this.repository.mailbox(actor);
  }
  private page<T extends { id: string }>(rows: T[], limit: number) {
    const hasMore = rows.length > limit;
    const data = rows.slice(0, limit);
    return {
      data,
      pagination: {
        cursor: hasMore ? data.at(-1)?.id : null,
        hasMore,
        limit,
      },
    };
  }
  private async ensureVisibleAdvisor(actor: Actor, advisorId?: string) {
    if (!advisorId || advisorId === "all") return;
    if (actor.role === "advisor" && advisorId !== actor.id)
      throw new AppError(
        403,
        "FORBIDDEN",
        "Solo puedes filtrar tu propia cartera.",
      );
    if (
      actor.role !== "advisor" &&
      !(await this.repository.advisor(actor, advisorId))
    )
      throw new AppError(
        422,
        "INVALID_ADVISOR",
        "Elige un asesor activo de tu empresa.",
      );
  }
}
