import type { Actor } from "../identity/IdentityTypes.js";
import { AppError } from "../shared/errors.js";
export function requireSuperAdmin(actor: Actor) {
  if (actor.role !== "super_admin")
    throw new AppError(
      403,
      "FORBIDDEN",
      "Esta acción requiere un usuario de plataforma.",
    );
}
export function requireChatWriter(actor: Actor) {
  if (!["commercial_coordinator", "advisor"].includes(actor.role))
    throw new AppError(
      403,
      "FORBIDDEN",
      "No tienes permisos para enviar mensajes.",
    );
}
export type SendResult = { waMessageId: string };
export type MediaDownload = {
  mimeType: string;
  bytes: Uint8Array;
};
export type WhatsAppTransport = {
  sendText(input: {
    phoneNumberId: string;
    accessToken: string;
    to: string;
    body: string;
  }): Promise<SendResult>;
  sendTemplate(input: {
    phoneNumberId: string;
    accessToken: string;
    to: string;
    templateName: string;
    languageCode: string;
    variables: string[];
  }): Promise<SendResult>;
  downloadMedia(input: {
    mediaId: string;
    accessToken: string;
  }): Promise<MediaDownload>;
};
