export function getConfig() {
  const production = process.env.NODE_ENV === "production";
  const origin = process.env.APP_ORIGIN ?? "http://localhost:3068";
  if (production && !origin.startsWith("https://"))
    throw new Error("APP_ORIGIN must use HTTPS");
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  return {
    production,
    origin,
    databaseUrl: process.env.DATABASE_URL,
    port: Number(process.env.PORT ?? 4068),
    // Detras del proxy inverso local toda peticion llega desde 127.0.0.1. Sin
    // un salto confiable, el limite por IP de los intentos de ingreso pasa a ser
    // una sola cubeta y quince intentos bloquean a toda la plataforma.
    trustProxy: process.env.TRUST_PROXY ?? false,
    mailTransport: process.env.MAIL_TRANSPORT ?? "local",
    metaWebhookVerifyToken: process.env.META_WEBHOOK_VERIFY_TOKEN,
    metaAppSecret: process.env.META_APP_SECRET,
    wompiPublicKey: process.env.WOMPI_PUBLIC_KEY,
    wompiIntegritySecret: process.env.WOMPI_INTEGRITY_SECRET,
    wompiEventsSecret: process.env.WOMPI_EVENTS_SECRET,
    visitPhotoStorageMode:
      process.env.VISIT_PHOTO_STORAGE_MODE ??
      (production ? "required:s3" : "local"),
  };
}
