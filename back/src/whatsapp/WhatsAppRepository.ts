import type { PrismaClient, Prisma } from "@prisma/client";
import type { Actor } from "../identity/IdentityTypes.js";
const userSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  active: true,
} as const;
const numberSelect = {
  id: true,
  phoneNumberId: true,
  businessAccountId: true,
  displayPhoneNumber: true,
  label: true,
  connectionStatus: true,
  lastVerifiedAt: true,
  lastConnectionError: true,
  advisor: { select: userSelect },
} as const;
export class WhatsAppRepository {
  constructor(private db: PrismaClient) {}
  private audit(
    tx: Prisma.TransactionClient,
    organizationId: string,
    actorId: string,
    action: string,
    resourceId: string,
  ) {
    return tx.auditEvent.create({
      data: { organizationId, actorId, action, resourceId },
    });
  }
  registerNumber(
    actor: Actor,
    organizationId: string,
    data: {
      phoneNumberId: string;
      businessAccountId: string;
      displayPhoneNumber: string;
      label: string;
    },
    accessTokenCipher: string,
  ) {
    return this.db.$transaction(async (tx) => {
      const number = await tx.whatsAppNumber.create({
        data: { ...data, organizationId, accessTokenCipher },
      });
      await this.audit(
        tx,
        organizationId,
        actor.id,
        "whatsapp.number.registered",
        number.id,
      );
      const safe = await tx.whatsAppNumber.findUniqueOrThrow({
        where: { id: number.id },
        select: numberSelect,
      });
      // Keep the legacy response contract without returning the ciphertext.
      return { ...safe, accessTokenCipher: "[cifrado]" };
    });
  }
  platformNumbers() {
    return this.db.whatsAppNumber.findMany({
      select: {
        ...numberSelect,
        organization: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }
  numbers(organizationId: string, advisorId?: string) {
    return this.db.whatsAppNumber.findMany({
      where: { organizationId, ...(advisorId ? { advisorId } : {}) },
      select: numberSelect,
      orderBy: { createdAt: "asc" },
    });
  }
  platformNumber(id: string) {
    return this.db.whatsAppNumber.findUnique({ where: { id } });
  }
  updateConnection(
    id: string,
    status: "verified" | "error",
    error: string | null,
    displayPhoneNumber?: string,
  ) {
    return this.db.whatsAppNumber.update({
      where: { id },
      data: {
        connectionStatus: status,
        lastVerifiedAt: status === "verified" ? new Date() : undefined,
        lastConnectionError: error,
        ...(displayPhoneNumber ? { displayPhoneNumber } : {}),
      },
      select: numberSelect,
    });
  }
  number(organizationId: string, id: string) {
    return this.db.whatsAppNumber.findFirst({
      where: { id, organizationId },
    });
  }
  advisor(organizationId: string, id: string) {
    return this.db.user.findFirst({
      where: { id, organizationId, role: "advisor", active: true },
    });
  }
  assignAdvisor(
    actor: Actor,
    organizationId: string,
    id: string,
    advisorId: string | null,
  ) {
    return this.db.$transaction(async (tx) => {
      const result = await tx.whatsAppNumber.updateMany({
        where: { id, organizationId },
        data: { advisorId },
      });
      if (!result.count) return null;
      await this.audit(
        tx,
        organizationId,
        actor.id,
        advisorId ? "whatsapp.number.assigned" : "whatsapp.number.unassigned",
        id,
      );
      return tx.whatsAppNumber.findUnique({
        where: { id },
        include: { advisor: { select: userSelect } },
      });
    });
  }
  conversations(organizationId: string, advisorId?: string) {
    return this.db.whatsAppConversation.findMany({
      where: {
        organizationId,
        ...(advisorId ? { whatsAppNumber: { advisorId } } : {}),
      },
      include: {
        whatsAppNumber: { select: { id: true, label: true, advisorId: true } },
        client: { select: { id: true, name: true } },
      },
      orderBy: { lastMessageAt: "desc" },
      take: 200,
    });
  }
  conversation(organizationId: string, id: string, advisorId?: string) {
    return this.db.whatsAppConversation.findFirst({
      where: {
        id,
        organizationId,
        ...(advisorId ? { whatsAppNumber: { advisorId } } : {}),
      },
      include: {
        whatsAppNumber: true,
        client: { select: { id: true, name: true } },
      },
    });
  }
  messages(conversationId: string) {
    return this.db.whatsAppMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: "asc" },
      take: 200,
      include: { sender: { select: userSelect } },
    });
  }
  createOutboundMessage(
    organizationId: string,
    conversationId: string,
    senderId: string,
    body: string,
  ) {
    return this.db.$transaction(async (tx) => {
      const message = await tx.whatsAppMessage.create({
        data: {
          organizationId,
          conversationId,
          senderId,
          direction: "outbound",
          type: "text",
          body,
          status: "queued",
        },
      });
      await tx.whatsAppConversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: new Date() },
      });
      return message;
    });
  }
  attachMedia(id: string, mediaUrl: string) {
    return this.db.whatsAppMessage.update({
      where: { id },
      data: { mediaUrl },
    });
  }
  markSent(id: string, waMessageId: string) {
    return this.db.whatsAppMessage.update({
      where: { id },
      data: { status: "sent", waMessageId },
    });
  }
  markFailed(id: string) {
    return this.db.whatsAppMessage.update({
      where: { id },
      data: { status: "failed" },
    });
  }
  findNumberByPhoneNumberId(phoneNumberId: string) {
    return this.db.whatsAppNumber.findUnique({ where: { phoneNumberId } });
  }
  findClientByPhone(organizationId: string, phone: string) {
    return this.db.client.findFirst({ where: { organizationId, phone } });
  }
  async ingestInbound(input: {
    organizationId: string;
    whatsAppNumberId: string;
    contactPhone: string;
    contactName: string | null;
    waMessageId: string;
    type: "text" | "image" | "video" | "audio" | "document";
    body: string;
    mediaId: string | null;
    clientId: string | null;
  }) {
    const existing = await this.db.whatsAppMessage.findUnique({
      where: { waMessageId: input.waMessageId },
    });
    if (existing) return existing;
    const conversation = await this.db.whatsAppConversation.upsert({
      where: {
        whatsAppNumberId_contactPhone: {
          whatsAppNumberId: input.whatsAppNumberId,
          contactPhone: input.contactPhone,
        },
      },
      create: {
        organizationId: input.organizationId,
        whatsAppNumberId: input.whatsAppNumberId,
        contactPhone: input.contactPhone,
        contactName: input.contactName,
        clientId: input.clientId,
        lastMessageAt: new Date(),
      },
      update: {
        lastMessageAt: new Date(),
        ...(input.contactName ? { contactName: input.contactName } : {}),
        ...(input.clientId ? { clientId: input.clientId } : {}),
      },
    });
    return this.db.whatsAppMessage.create({
      data: {
        organizationId: input.organizationId,
        conversationId: conversation.id,
        direction: "inbound",
        type: input.type,
        body: input.body,
        mediaId: input.mediaId,
        waMessageId: input.waMessageId,
        status: "received",
      },
    });
  }
  updateStatus(
    waMessageId: string,
    status: "sent" | "delivered" | "read" | "failed",
  ) {
    return this.db.whatsAppMessage.updateMany({
      where: { waMessageId },
      data: { status },
    });
  }
}
