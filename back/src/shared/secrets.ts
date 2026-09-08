import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "node:crypto";
import { AppError } from "./errors.js";
function key() {
  const secret = process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY;
  if (!secret)
    throw new AppError(
      503,
      "SECRETS_NOT_CONFIGURED",
      "Falta configurar el cifrado de credenciales de WhatsApp en este entorno.",
    );
  return scryptSync(secret, "ruts68-whatsapp-token", 32);
}
export function encryptSecret(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map((part) => part.toString("base64")).join(".");
}
export function decryptSecret(cipherText: string) {
  const [ivPart, tagPart, dataPart] = cipherText.split(".");
  if (!ivPart || !tagPart || !dataPart)
    throw new AppError(
      500,
      "SECRET_CORRUPT",
      "No pudimos leer una credencial almacenada.",
    );
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key(),
    Buffer.from(ivPart, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tagPart, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataPart, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
