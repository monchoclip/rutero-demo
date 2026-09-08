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
    mailTransport: process.env.MAIL_TRANSPORT ?? "local",
  };
}
