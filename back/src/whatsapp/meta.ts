import { createHmac, timingSafeEqual } from "node:crypto";

// GET handshake Meta sends once when the webhook URL is (re)configured in
// Meta Business Manager. Must echo hub.challenge verbatim on success.
export function verifyHandshake(
  query: Record<string, string | undefined>,
  verifyToken: string,
) {
  if (
    query["hub.mode"] === "subscribe" &&
    query["hub.verify_token"] === verifyToken &&
    query["hub.challenge"]
  )
    return query["hub.challenge"];
  return null;
}

// Every POST carries X-Hub-Signature-256: sha256=<hex hmac of the raw body>.
export function verifySignature(
  rawBody: string,
  signatureHeader: string | undefined,
  appSecret: string,
) {
  const expected = signatureHeader?.startsWith("sha256=")
    ? signatureHeader.slice(7)
    : null;
  if (!expected) return false;
  const actual = createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const actualBuffer = Buffer.from(actual, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

export type InboundMessage = {
  phoneNumberId: string;
  contactPhone: string;
  contactName: string | null;
  waMessageId: string;
  type: "text" | "image" | "video" | "audio" | "document";
  body: string;
  mediaId: string | null;
};
export type InboundStatus = {
  waMessageId: string;
  status: "sent" | "delivered" | "read" | "failed";
};

const mediaTypes = ["image", "video", "audio", "document"] as const;

// Meta batches multiple entries/changes per call; we flatten to the shapes
// the service actually persists and ignore fields we don't use (reactions,
// stickers, location, contacts-shared, etc. fall through as unsupported).
export function parseInboundEvents(rawBody: string): {
  messages: InboundMessage[];
  statuses: InboundStatus[];
} {
  const messages: InboundMessage[] = [];
  const statuses: InboundStatus[] = [];
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return { messages, statuses };
  }
  const entries =
    isRecord(payload) && Array.isArray(payload.entry) ? payload.entry : [];
  for (const entry of entries) {
    const changes =
      isRecord(entry) && Array.isArray(entry.changes) ? entry.changes : [];
    for (const change of changes) {
      const value = isRecord(change) ? change.value : undefined;
      if (!isRecord(value)) continue;
      const phoneNumberId = isRecord(value.metadata)
        ? String(value.metadata.phone_number_id ?? "")
        : "";
      if (!phoneNumberId) continue;
      const profileByWaId = new Map<string, string>();
      if (Array.isArray(value.contacts))
        for (const contact of value.contacts)
          if (isRecord(contact) && isRecord(contact.profile))
            profileByWaId.set(
              String(contact.wa_id ?? ""),
              String(contact.profile.name ?? ""),
            );
      if (Array.isArray(value.messages))
        for (const raw of value.messages) {
          const parsed = parseMessage(raw, phoneNumberId, profileByWaId);
          if (parsed) messages.push(parsed);
        }
      if (Array.isArray(value.statuses))
        for (const raw of value.statuses) {
          const parsed = parseStatus(raw);
          if (parsed) statuses.push(parsed);
        }
    }
  }
  return { messages, statuses };
}

function parseMessage(
  raw: unknown,
  phoneNumberId: string,
  profileByWaId: Map<string, string>,
): InboundMessage | null {
  if (!isRecord(raw)) return null;
  const from = String(raw.from ?? "");
  const waMessageId = String(raw.id ?? "");
  const type = String(raw.type ?? "");
  if (!from || !waMessageId) return null;
  if (type === "text")
    return {
      phoneNumberId,
      contactPhone: from,
      contactName: profileByWaId.get(from) ?? null,
      waMessageId,
      type: "text",
      body: isRecord(raw.text) ? String(raw.text.body ?? "") : "",
      mediaId: null,
    };
  if ((mediaTypes as readonly string[]).includes(type)) {
    const media = isRecord(raw[type]) ? raw[type] : undefined;
    return {
      phoneNumberId,
      contactPhone: from,
      contactName: profileByWaId.get(from) ?? null,
      waMessageId,
      type: type as (typeof mediaTypes)[number],
      body: isRecord(media) ? String(media.caption ?? "") : "",
      mediaId: isRecord(media) ? String(media.id ?? "") || null : null,
    };
  }
  return null;
}

function parseStatus(raw: unknown): InboundStatus | null {
  if (!isRecord(raw)) return null;
  const waMessageId = String(raw.id ?? "");
  const status = String(raw.status ?? "");
  if (!waMessageId || !["sent", "delivered", "read", "failed"].includes(status))
    return null;
  return { waMessageId, status: status as InboundStatus["status"] };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
