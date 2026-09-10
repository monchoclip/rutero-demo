import { createHash } from "node:crypto";

const imageDataUrlPattern =
  /^data:(image\/(?:jpeg|jpg|png|webp));base64,([A-Za-z0-9+/=]+)$/;

export type StoredVisitPhoto = {
  dataUrl?: string;
  storageKey: string;
  sha256: string;
  contentType: string;
  sizeBytes: number;
};

export function storeVisitPhoto(input: {
  organizationId: string;
  activityId: string;
  dataUrl: string;
}): StoredVisitPhoto {
  const match = imageDataUrlPattern.exec(input.dataUrl);
  if (!match) throw new Error("INVALID_VISIT_PHOTO");
  const [, contentType, base64] = match;
  const bytes = Buffer.from(base64, "base64");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const extension = extensionFor(contentType);
  const storageKey = [
    "organizations",
    input.organizationId,
    "visits",
    input.activityId,
    `${sha256}.${extension}`,
  ].join("/");
  return {
    dataUrl: shouldKeepLocalDataUrl() ? input.dataUrl : undefined,
    storageKey,
    sha256,
    contentType,
    sizeBytes: bytes.byteLength,
  };
}

function shouldKeepLocalDataUrl() {
  return process.env.VISIT_PHOTO_STORAGE_MODE !== "external";
}

function extensionFor(contentType: string) {
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  return "jpg";
}
