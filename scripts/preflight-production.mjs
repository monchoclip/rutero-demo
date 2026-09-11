#!/usr/bin/env node

import { fileURLToPath } from "node:url";

const requiredSecrets = [
  "META_WEBHOOK_VERIFY_TOKEN",
  "META_APP_SECRET",
  "WOMPI_PUBLIC_KEY",
  "WOMPI_INTEGRITY_SECRET",
  "WOMPI_EVENTS_SECRET",
];

const commonWeakSecrets = new Set([
  "changeme",
  "change-me",
  "password",
  "secret",
  "test",
  "demo",
  "unit-test-encryption-key",
]);

function present(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function addIssue(issues, key, message) {
  issues.push({ key, message });
}

function isLocalDatabaseUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { local: true, reason: "no es una URL PostgreSQL valida" };
  }
  const host = parsed.hostname.toLowerCase();
  const database = parsed.pathname.replace(/^\//, "").toLowerCase();
  if (!["postgresql:", "postgres:"].includes(parsed.protocol)) {
    return { local: true, reason: "debe usar protocolo postgresql" };
  }
  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host.endsWith(".local")
  ) {
    return { local: true, reason: "apunta a un host local" };
  }
  if (["ruts68_test", "test", "postgres"].includes(database)) {
    return {
      local: true,
      reason: "apunta a una base reservada para pruebas o administracion",
    };
  }
  return { local: false };
}

function hasStrongEncryptionKey(value) {
  if (!present(value)) return false;
  const trimmed = value.trim();
  if (trimmed.length < 32) return false;
  if (commonWeakSecrets.has(trimmed.toLowerCase())) return false;
  const classes = [
    /[a-z]/.test(trimmed),
    /[A-Z]/.test(trimmed),
    /\d/.test(trimmed),
    /[^a-zA-Z\d]/.test(trimmed),
  ].filter(Boolean).length;
  return classes >= 3;
}

function validateProductionPreflight(env = process.env) {
  const issues = [];
  if (env.NODE_ENV !== "production") {
    addIssue(issues, "NODE_ENV", "debe ser production");
  }

  if (!present(env.APP_ORIGIN)) {
    addIssue(issues, "APP_ORIGIN", "es requerido y debe usar HTTPS");
  } else {
    try {
      const origin = new URL(env.APP_ORIGIN);
      if (origin.protocol !== "https:") {
        addIssue(issues, "APP_ORIGIN", "debe usar HTTPS");
      }
    } catch {
      addIssue(issues, "APP_ORIGIN", "debe ser una URL valida");
    }
  }

  if (!present(env.DATABASE_URL)) {
    addIssue(issues, "DATABASE_URL", "es requerido y no puede apuntar a local");
  } else {
    const database = isLocalDatabaseUrl(env.DATABASE_URL);
    if (database.local) {
      addIssue(issues, "DATABASE_URL", database.reason);
    }
  }

  for (const key of requiredSecrets) {
    if (!present(env[key]))
      addIssue(issues, key, "es requerido para produccion");
  }

  if (!hasStrongEncryptionKey(env.WHATSAPP_TOKEN_ENCRYPTION_KEY)) {
    addIssue(
      issues,
      "WHATSAPP_TOKEN_ENCRYPTION_KEY",
      "debe tener al menos 32 caracteres y mezcla de tipos de caracteres",
    );
  }

  if (env.VISIT_PHOTO_STORAGE_MODE !== "s3") {
    addIssue(issues, "VISIT_PHOTO_STORAGE_MODE", "debe ser s3");
  }
  if (!present(env.VISIT_PHOTO_S3_BUCKET)) {
    addIssue(issues, "VISIT_PHOTO_S3_BUCKET", "es requerido");
  }
  if (!present(env.VISIT_PHOTO_S3_REGION) && !present(env.AWS_REGION)) {
    addIssue(
      issues,
      "VISIT_PHOTO_S3_REGION",
      "es requerido si AWS_REGION no esta definido",
    );
  }

  const mailTransport = env.MAIL_TRANSPORT ?? "";
  if (mailTransport !== "ses") {
    addIssue(issues, "MAIL_TRANSPORT", "debe ser ses en produccion");
  } else {
    if (!present(env.MAIL_FROM))
      addIssue(issues, "MAIL_FROM", "es requerido para SES");
    if (!present(env.AWS_REGION) && !present(env.VISIT_PHOTO_S3_REGION)) {
      addIssue(
        issues,
        "AWS_REGION",
        "es requerido para SES o debe coincidir con la region S3",
      );
    }
  }

  return {
    ok: issues.length === 0,
    checked: [
      "NODE_ENV",
      "APP_ORIGIN",
      "DATABASE_URL",
      ...requiredSecrets,
      "WHATSAPP_TOKEN_ENCRYPTION_KEY",
      "VISIT_PHOTO_STORAGE_MODE",
      "VISIT_PHOTO_S3_BUCKET",
      "VISIT_PHOTO_S3_REGION/AWS_REGION",
      "MAIL_TRANSPORT",
      "MAIL_FROM",
    ],
    issues,
  };
}

function render(result) {
  const lines = ["Ruts68 production preflight"];
  if (result.ok) {
    lines.push("OK: configuracion minima lista para ensayo de produccion.");
    lines.push(`Variables revisadas: ${result.checked.join(", ")}`);
    return lines.join("\n");
  }
  lines.push("ERROR: faltan ajustes antes de produccion.");
  for (const issue of result.issues) {
    lines.push(`- ${issue.key}: ${issue.message}`);
  }
  lines.push("No se imprimieron valores de secretos.");
  return lines.join("\n");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const result = validateProductionPreflight(process.env);
  console.log(render(result));
  process.exit(result.ok ? 0 : 1);
}

export { validateProductionPreflight, render };
