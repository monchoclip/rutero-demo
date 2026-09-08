import type { WhatsAppTransport } from "./WhatsAppTypes.js";
import { AppError } from "../shared/errors.js";

const graphBaseUrl = "https://graph.facebook.com/v21.0";
const maxMediaBytes = 5 * 1024 * 1024;

type MetaMessageResponse = {
  messages?: { id: string }[];
  error?: { message?: string };
};

type MetaMediaResponse = {
  url?: string;
  mime_type?: string;
  error?: { message?: string };
};

// Real Meta Cloud API adapter. No local credentials exist to exercise this
// against Meta's servers, so it is prepared, not externally validated.
export const metaTransport: WhatsAppTransport = {
  async sendText({ phoneNumberId, accessToken, to, body }) {
    const response = await sendMessage(phoneNumberId, accessToken, {
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body },
    });
    return requireMessageId(response, "WHATSAPP_SEND_FAILED");
  },
  async sendTemplate({
    phoneNumberId,
    accessToken,
    to,
    templateName,
    languageCode,
    variables,
  }) {
    const response = await sendMessage(phoneNumberId, accessToken, {
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: templateName,
        language: { code: languageCode },
        ...(variables.length
          ? {
              components: [
                {
                  type: "body",
                  parameters: variables.map((text) => ({ type: "text", text })),
                },
              ],
            }
          : {}),
      },
    });
    return requireMessageId(response, "WHATSAPP_TEMPLATE_FAILED");
  },
  async downloadMedia({ mediaId, accessToken }) {
    const metadata = await fetch(`${graphBaseUrl}/${mediaId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const media = (await metadata
      .json()
      .catch(() => null)) as MetaMediaResponse | null;
    if (!metadata.ok || !media?.url)
      throw new AppError(
        502,
        "WHATSAPP_MEDIA_LOOKUP_FAILED",
        media?.error?.message ??
          "No pudimos consultar el archivo recibido por WhatsApp.",
      );
    const response = await fetch(media.url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok)
      throw new AppError(
        502,
        "WHATSAPP_MEDIA_DOWNLOAD_FAILED",
        "No pudimos descargar el archivo recibido por WhatsApp.",
      );
    const declaredSize = Number(response.headers.get("content-length") ?? "0");
    if (declaredSize > maxMediaBytes)
      throw new AppError(
        413,
        "WHATSAPP_MEDIA_TOO_LARGE",
        "El archivo recibido supera el límite local de descarga.",
      );
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > maxMediaBytes)
      throw new AppError(
        413,
        "WHATSAPP_MEDIA_TOO_LARGE",
        "El archivo recibido supera el límite local de descarga.",
      );
    return {
      mimeType: media.mime_type ?? "application/octet-stream",
      bytes,
    };
  },
};

async function sendMessage(
  phoneNumberId: string,
  accessToken: string,
  payload: Record<string, unknown>,
) {
  const response = await fetch(`${graphBaseUrl}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  });
  const body = (await response
    .json()
    .catch(() => null)) as MetaMessageResponse | null;
  return { ok: response.ok, body };
}

function requireMessageId(
  response: { ok: boolean; body: MetaMessageResponse | null },
  code: string,
) {
  const id = response.body?.messages?.[0]?.id;
  if (!response.ok || !id)
    throw new AppError(
      502,
      code,
      response.body?.error?.message ??
        "No pudimos enviar el mensaje por WhatsApp.",
    );
  return { waMessageId: id };
}
