import type { Handler } from "../../shared/context.js";
import { idSchema } from "../../crm/CrmSchema.js";
import { AppError } from "../../shared/errors.js";
import { WhatsAppService } from "../WhatsAppService.js";
import {
  registerNumberSchema,
  assignmentSchema,
  sendMessageSchema,
  templateMessageSchema,
} from "../WhatsAppSchema.js";
import { verifyHandshake } from "../meta.js";
export function whatsAppHandlers(
  whatsapp: WhatsAppService,
  verifyToken: string | undefined,
): Record<string, Handler> {
  return {
    platformRegisterNumber: async (r, reply) => {
      const result = await whatsapp.registerNumber(
        r.actor!,
        registerNumberSchema.parse(r.body),
      );
      reply.code(201);
      return result;
    },
    platformListNumbers: async (r) => whatsapp.platformNumbers(r.actor!),
    whatsappNumbers: async (r) => whatsapp.numbers(r.actor!),
    whatsappAssign: async (r) =>
      whatsapp.assignAdvisor(
        r.actor!,
        idSchema.parse(r.params).id,
        assignmentSchema.parse(r.body),
      ),
    whatsappConversations: async (r) => whatsapp.conversations(r.actor!),
    whatsappMessages: async (r) =>
      whatsapp.messages(r.actor!, idSchema.parse(r.params).id),
    whatsappSend: async (r, reply) => {
      const result = await whatsapp.send(
        r.actor!,
        idSchema.parse(r.params).id,
        sendMessageSchema.parse(r.body),
      );
      reply.code(201);
      return result;
    },
    whatsappSendTemplate: async (r, reply) => {
      const result = await whatsapp.sendTemplate(
        r.actor!,
        idSchema.parse(r.params).id,
        templateMessageSchema.parse(r.body),
      );
      reply.code(201);
      return result;
    },
    whatsappWebhookVerify: async (r) => {
      if (!verifyToken)
        throw new AppError(
          503,
          "WEBHOOK_NOT_CONFIGURED",
          "El webhook de WhatsApp no está configurado en este entorno.",
        );
      const challenge = verifyHandshake(
        r.query as Record<string, string | undefined>,
        verifyToken,
      );
      if (challenge === null)
        throw new AppError(403, "INVALID_HANDSHAKE", "Token inválido.");
      return challenge;
    },
    whatsappWebhookEvents: async (r) => {
      if (
        !whatsapp.verifyEvent(
          r.rawBody,
          r.headers["x-hub-signature-256"] as string | undefined,
        )
      )
        throw new AppError(401, "INVALID_SIGNATURE", "Firma inválida.");
      return whatsapp.ingest(r.rawBody);
    },
  };
}
