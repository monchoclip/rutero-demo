import type { Actor } from "../identity/IdentityTypes.js";
import { AppError, notFound } from "../shared/errors.js";
import { encryptSecret, decryptSecret } from "../shared/secrets.js";
import { WhatsAppRepository } from "./WhatsAppRepository.js";
import type {
  registerNumberSchema,
  assignmentSchema,
  sendMessageSchema,
  templateMessageSchema,
} from "./WhatsAppSchema.js";
import {
  requireSuperAdmin,
  requireChatWriter,
  type WhatsAppTransport,
} from "./WhatsAppTypes.js";
import { parseInboundEvents, verifySignature } from "./meta.js";
import type { z } from "zod";
export class WhatsAppService {
  constructor(
    private repository: WhatsAppRepository,
    private transport: WhatsAppTransport,
    private appSecret: string | undefined,
  ) {}
  // Platform (super_admin): register a number for a company. Numbers are
  // registered centrally so a company only ever sees numbers it was given.
  async registerNumber(
    actor: Actor,
    input: z.infer<typeof registerNumberSchema>,
  ) {
    requireSuperAdmin(actor);
    const { organizationId, accessToken, ...data } = input;
    return this.repository.registerNumber(
      actor,
      organizationId,
      data,
      encryptSecret(accessToken),
    );
  }
  platformNumbers(actor: Actor) {
    requireSuperAdmin(actor);
    return this.repository.platformNumbers();
  }
  // Coordination reads every number the company has; an advisor only ever
  // sees their own, which also lets the UI decide whether to show the tab
  // at all without a separate "is WhatsApp enabled" check.
  numbers(actor: Actor) {
    requireChatOrCoordination(actor);
    return this.repository.numbers(
      tenant(actor),
      actor.role === "advisor" ? actor.id : undefined,
    );
  }
  async assignAdvisor(
    actor: Actor,
    numberId: string,
    input: z.infer<typeof assignmentSchema>,
  ) {
    if (actor.role !== "commercial_coordinator")
      throw new AppError(
        403,
        "FORBIDDEN",
        "Esta acción requiere coordinación comercial.",
      );
    const organizationId = tenant(actor);
    if (
      input.advisorId &&
      !(await this.repository.advisor(organizationId, input.advisorId))
    )
      throw new AppError(
        422,
        "INVALID_ADVISOR",
        "Elige un asesor activo de tu empresa.",
      );
    const updated = await this.repository.assignAdvisor(
      actor,
      organizationId,
      numberId,
      input.advisorId,
    );
    if (!updated) notFound();
    return updated;
  }
  // Conversations/messages: commercial and administrative coordination see
  // every conversation for the company; an advisor sees only the numbers
  // assigned to them, matching the same portfolio ownership rule as clients.
  async conversations(actor: Actor) {
    requireChatOrCoordination(actor);
    return this.repository.conversations(
      tenant(actor),
      actor.role === "advisor" ? actor.id : undefined,
    );
  }
  async conversation(actor: Actor, id: string) {
    requireChatOrCoordination(actor);
    const conversation = await this.repository.conversation(
      tenant(actor),
      id,
      actor.role === "advisor" ? actor.id : undefined,
    );
    if (!conversation) notFound();
    return conversation;
  }
  async messages(actor: Actor, conversationId: string) {
    await this.conversation(actor, conversationId);
    return this.repository.messages(conversationId);
  }
  async send(
    actor: Actor,
    conversationId: string,
    input: z.infer<typeof sendMessageSchema>,
  ) {
    requireChatWriter(actor);
    const organizationId = tenant(actor);
    const conversation = await this.repository.conversation(
      organizationId,
      conversationId,
      actor.role === "advisor" ? actor.id : undefined,
    );
    if (!conversation) notFound();
    const number = conversation.whatsAppNumber;
    const message = await this.repository.createOutboundMessage(
      organizationId,
      conversationId,
      actor.id,
      input.body,
    );
    try {
      const result = await this.transport.sendText({
        phoneNumberId: number.phoneNumberId,
        accessToken: decryptSecret(number.accessTokenCipher),
        to: conversation.contactPhone,
        body: input.body,
      });
      return this.repository.markSent(message.id, result.waMessageId);
    } catch {
      return this.repository.markFailed(message.id);
    }
  }
  async sendTemplate(
    actor: Actor,
    conversationId: string,
    input: z.infer<typeof templateMessageSchema>,
  ) {
    requireChatWriter(actor);
    const organizationId = tenant(actor);
    const conversation = await this.repository.conversation(
      organizationId,
      conversationId,
      actor.role === "advisor" ? actor.id : undefined,
    );
    if (!conversation) notFound();
    const number = conversation.whatsAppNumber;
    const message = await this.repository.createOutboundMessage(
      organizationId,
      conversationId,
      actor.id,
      templateBody(input),
    );
    try {
      const result = await this.transport.sendTemplate({
        phoneNumberId: number.phoneNumberId,
        accessToken: decryptSecret(number.accessTokenCipher),
        to: conversation.contactPhone,
        templateName: input.templateName,
        languageCode: input.languageCode,
        variables: input.variables,
      });
      return this.repository.markSent(message.id, result.waMessageId);
    } catch {
      return this.repository.markFailed(message.id);
    }
  }
  // Webhook: verified against Meta's app secret, not tenant-scoped by
  // cookie. Responds fast and never lets an internal error surface —
  // ingestion failures are swallowed per message so one bad event can't
  // block the rest of the batch or make Meta retry the whole delivery.
  verifyEvent(rawBody: string, signature: string | undefined) {
    if (!this.appSecret)
      throw new AppError(
        503,
        "WEBHOOK_NOT_CONFIGURED",
        "El webhook de WhatsApp no está configurado en este entorno.",
      );
    return verifySignature(rawBody, signature, this.appSecret);
  }
  async ingest(rawBody: string) {
    const { messages, statuses } = parseInboundEvents(rawBody);
    for (const status of statuses) {
      try {
        await this.repository.updateStatus(status.waMessageId, status.status);
      } catch {
        // Best-effort: a status we can't match to a stored message is skipped.
      }
    }
    for (const message of messages) {
      try {
        const number = await this.repository.findNumberByPhoneNumberId(
          message.phoneNumberId,
        );
        if (!number) continue; // Not a number registered in Ruts68; ignore.
        const client = await this.repository.findClientByPhone(
          number.organizationId,
          message.contactPhone,
        );
        const stored = await this.repository.ingestInbound({
          organizationId: number.organizationId,
          whatsAppNumberId: number.id,
          contactPhone: message.contactPhone,
          contactName: message.contactName,
          waMessageId: message.waMessageId,
          type: message.type,
          body: message.body,
          mediaId: message.mediaId,
          clientId: client?.id ?? null,
        });
        if (message.mediaId) {
          try {
            const media = await this.transport.downloadMedia({
              mediaId: message.mediaId,
              accessToken: decryptSecret(number.accessTokenCipher),
            });
            await this.repository.attachMedia(stored.id, dataUrl(media));
          } catch {
            // Keep the message even when the optional media download fails.
          }
        }
      } catch {
        // One malformed/duplicate event must not fail the whole batch.
      }
    }
    return { received: true };
  }
}
function templateBody(input: z.infer<typeof templateMessageSchema>) {
  const values = input.variables.length
    ? ` · variables: ${input.variables.join(" | ")}`
    : "";
  return `Plantilla Meta ${input.templateName} (${input.languageCode})${values}`;
}
function dataUrl(input: { mimeType: string; bytes: Uint8Array }) {
  return `data:${input.mimeType};base64,${Buffer.from(input.bytes).toString("base64")}`;
}
function tenant(actor: Actor) {
  if (!actor.organizationId)
    throw new AppError(
      403,
      "TENANT_REQUIRED",
      "Selecciona un contexto de empresa autorizado.",
    );
  return actor.organizationId;
}
function requireChatOrCoordination(actor: Actor) {
  if (
    ![
      "commercial_coordinator",
      "administrative_coordinator",
      "advisor",
    ].includes(actor.role)
  )
    throw new AppError(403, "FORBIDDEN", "No tienes acceso a esta bandeja.");
}
