import { createHash } from "node:crypto";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { AppError } from "../shared/errors.js";

const imageDataUrlPattern =
  /^data:(image\/(?:jpeg|jpg|png|webp));base64,([A-Za-z0-9+/=]+)$/;
const DEFAULT_VISIT_PHOTO_LIMIT_BYTES = 2 * 1024 * 1024;
const DEFAULT_DOWNLOAD_TTL_SECONDS = 300;

export type VisitPhotoMetadata = {
  storageKey: string;
  sha256: string;
  contentType: string;
  sizeBytes: number;
};

export type StoredVisitPhoto = VisitPhotoMetadata & {
  dataUrl?: string;
};

export type VisitPhotoDownload =
  | { mode: "redirect"; url: string; expiresInSeconds: number }
  | { mode: "data"; dataUrl: string; contentType: string; sizeBytes: number };

export type VisitPhotoStorage = {
  store(input: {
    organizationId: string;
    activityId: string;
    dataUrl: string;
  }): Promise<StoredVisitPhoto>;
  authorizeDownload(input: {
    storageKey: string;
    dataUrl?: string | null;
    contentType: string;
    sizeBytes: number;
  }): Promise<VisitPhotoDownload>;
  delete(storageKey: string): Promise<void>;
};

export type VisitPhotoStorageConfig =
  | { mode: "local"; maxBytes: number; retentionDays: number }
  | {
      mode: "s3";
      bucket: string;
      region: string;
      endpoint?: string;
      forcePathStyle: boolean;
      maxBytes: number;
      retentionDays: number;
      downloadTtlSeconds: number;
    };

export function visitPhotoStorageConfigFromEnv(): VisitPhotoStorageConfig {
  const rawMode = process.env.VISIT_PHOTO_STORAGE_MODE;
  const production = process.env.NODE_ENV === "production";
  if (!rawMode && production)
    throw new Error("VISIT_PHOTO_STORAGE_MODE=s3 is required in production");
  const mode = rawMode ?? "local";
  if (mode !== "local" && mode !== "s3")
    throw new Error("VISIT_PHOTO_STORAGE_MODE must be local or s3");
  if (production && mode !== "s3")
    throw new Error("VISIT_PHOTO_STORAGE_MODE=s3 is required in production");
  const maxBytes = envInt(
    "VISIT_PHOTO_MAX_BYTES",
    DEFAULT_VISIT_PHOTO_LIMIT_BYTES,
  );
  const retentionDays = envInt("VISIT_PHOTO_RETENTION_DAYS", 365);
  if (mode === "local") return { mode, maxBytes, retentionDays };
  const bucket = process.env.VISIT_PHOTO_S3_BUCKET;
  if (!bucket) throw new Error("VISIT_PHOTO_S3_BUCKET is required");
  const region = process.env.VISIT_PHOTO_S3_REGION ?? process.env.AWS_REGION;
  if (!region)
    throw new Error("VISIT_PHOTO_S3_REGION or AWS_REGION is required");
  return {
    mode,
    bucket,
    region,
    endpoint: process.env.VISIT_PHOTO_S3_ENDPOINT,
    forcePathStyle: process.env.VISIT_PHOTO_S3_FORCE_PATH_STYLE === "true",
    maxBytes,
    retentionDays,
    downloadTtlSeconds: envInt(
      "VISIT_PHOTO_DOWNLOAD_TTL_SECONDS",
      DEFAULT_DOWNLOAD_TTL_SECONDS,
    ),
  };
}

export function createVisitPhotoStorage(
  config: VisitPhotoStorageConfig,
): VisitPhotoStorage {
  return config.mode === "s3"
    ? new S3VisitPhotoStorage(config)
    : new LocalVisitPhotoStorage(config);
}

export function parseVisitPhotoDataUrl(
  dataUrl: string,
  maxBytes = DEFAULT_VISIT_PHOTO_LIMIT_BYTES,
): VisitPhotoMetadata & { bytes: Buffer } {
  const match = imageDataUrlPattern.exec(dataUrl);
  if (!match)
    throw new AppError(
      422,
      "INVALID_VISIT_PHOTO",
      "La fotografía debe ser JPEG, PNG o WebP en base64.",
    );
  const [, rawContentType, base64] = match;
  const contentType =
    rawContentType === "image/jpg" ? "image/jpeg" : rawContentType;
  const bytes = Buffer.from(base64, "base64");
  if (bytes.byteLength <= 0 || bytes.byteLength > maxBytes)
    throw new AppError(
      422,
      "VISIT_PHOTO_TOO_LARGE",
      `La fotografía debe pesar máximo ${Math.floor(maxBytes / 1024 / 1024)} MB.`,
    );
  if (!matchesImageSignature(bytes, contentType))
    throw new AppError(
      422,
      "INVALID_VISIT_PHOTO",
      "La fotografía debe tener bytes reales JPEG, PNG o WebP.",
    );
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  return {
    bytes,
    storageKey: "",
    sha256,
    contentType,
    sizeBytes: bytes.byteLength,
  };
}

function matchesImageSignature(bytes: Buffer, contentType: string) {
  if (contentType === "image/jpeg")
    return (
      bytes.byteLength >= 4 &&
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes[bytes.byteLength - 2] === 0xff &&
      bytes[bytes.byteLength - 1] === 0xd9
    );
  if (contentType === "image/png")
    return (
      bytes.byteLength >= 8 &&
      bytes
        .subarray(0, 8)
        .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    );
  if (contentType === "image/webp")
    return (
      bytes.byteLength >= 12 &&
      bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
      bytes.subarray(8, 12).toString("ascii") === "WEBP"
    );
  return false;
}

export async function storeVisitPhoto(input: {
  organizationId: string;
  activityId: string;
  dataUrl: string;
  storage?: VisitPhotoStorage;
}): Promise<StoredVisitPhoto> {
  const storage =
    input.storage ?? createVisitPhotoStorage(visitPhotoStorageConfigFromEnv());
  return storage.store(input);
}

class LocalVisitPhotoStorage implements VisitPhotoStorage {
  constructor(
    private config: Extract<VisitPhotoStorageConfig, { mode: "local" }>,
  ) {}

  async store(input: {
    organizationId: string;
    activityId: string;
    dataUrl: string;
  }): Promise<StoredVisitPhoto> {
    const { bytes: _bytes, ...metadata } = parseVisitPhoto(
      input,
      this.config.maxBytes,
    );
    return { ...metadata, dataUrl: input.dataUrl };
  }

  async authorizeDownload(input: {
    dataUrl?: string | null;
    contentType: string;
    sizeBytes: number;
  }): Promise<VisitPhotoDownload> {
    if (!input.dataUrl)
      throw new AppError(
        404,
        "VISIT_PHOTO_BINARY_NOT_AVAILABLE",
        "La fotografía no está disponible en el almacenamiento local.",
      );
    return {
      mode: "data",
      dataUrl: input.dataUrl,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
    };
  }

  async delete() {}
}

class S3VisitPhotoStorage implements VisitPhotoStorage {
  private client: S3Client;

  constructor(
    private config: Extract<VisitPhotoStorageConfig, { mode: "s3" }>,
  ) {
    this.client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      forcePathStyle: config.forcePathStyle,
    });
  }

  async store(input: {
    organizationId: string;
    activityId: string;
    dataUrl: string;
  }): Promise<StoredVisitPhoto> {
    const metadata = parseVisitPhoto(input, this.config.maxBytes);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: metadata.storageKey,
        Body: metadata.bytes,
        ContentType: metadata.contentType,
        Metadata: {
          sha256: metadata.sha256,
          organizationId: input.organizationId,
          activityId: input.activityId,
          retentionDays: String(this.config.retentionDays),
        },
      }),
    );
    const { bytes: _bytes, ...stored } = metadata;
    return stored;
  }

  async authorizeDownload(input: {
    storageKey: string;
  }): Promise<VisitPhotoDownload> {
    const url = await getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.config.bucket,
        Key: input.storageKey,
      }),
      { expiresIn: this.config.downloadTtlSeconds },
    );
    return {
      mode: "redirect",
      url,
      expiresInSeconds: this.config.downloadTtlSeconds,
    };
  }

  async delete(storageKey: string) {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.config.bucket,
        Key: storageKey,
      }),
    );
  }
}

function parseVisitPhoto(
  input: { organizationId: string; activityId: string; dataUrl: string },
  maxBytes: number,
) {
  const {
    bytes,
    storageKey: _empty,
    ...metadata
  } = parseVisitPhotoDataUrl(input.dataUrl, maxBytes);
  const extension = extensionFor(metadata.contentType);
  return {
    ...metadata,
    bytes,
    storageKey: [
      "organizations",
      input.organizationId,
      "visits",
      input.activityId,
      `${metadata.sha256}.${extension}`,
    ].join("/"),
  };
}

function extensionFor(contentType: string) {
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  return "jpg";
}

function envInt(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0)
    throw new Error(`${name} must be a positive integer`);
  return value;
}
