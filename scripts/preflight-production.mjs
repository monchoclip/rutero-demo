#!/usr/bin/env node

import { fileURLToPath } from "node:url";

// Cada integracion externa declara sus secretos. El backend falla cerrado si
// falta alguno: el webhook de Meta responde 503 WEBHOOK_NOT_CONFIGURED, el de
// Wompi responde 404 NOT_CONFIGURED y el checkout no se ofrece sin las llaves.
// Por eso se puede publicar sin ellas, siempre que la ausencia sea una decision
// declarada y no un olvido; eso es lo que exige DISABLED_INTEGRATIONS.
const integrationSecrets = {
  whatsapp: ["META_WEBHOOK_VERIFY_TOKEN", "META_APP_SECRET"],
  wompi: ["WOMPI_PUBLIC_KEY", "WOMPI_INTEGRITY_SECRET", "WOMPI_EVENTS_SECRET"],
};

const knownIntegrations = Object.keys(integrationSecrets);

function parseDisabledIntegrations(raw) {
  const declared = (raw ?? "")
    .split(",")
    .map((name) => name.trim().toLowerCase())
    .filter((name) => name.length > 0);
  return {
    disabled: declared.filter((name) => knownIntegrations.includes(name)),
    unknown: declared.filter((name) => !knownIntegrations.includes(name)),
  };
}

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
    return {
      local: true,
      reserved: false,
      malformed: true,
      reason: "no es una URL PostgreSQL valida",
    };
  }
  const host = parsed.hostname.toLowerCase();
  const database = parsed.pathname.replace(/^\//, "").toLowerCase();
  if (!["postgresql:", "postgres:"].includes(parsed.protocol)) {
    return {
      local: true,
      reserved: false,
      malformed: true,
      reason: "debe usar protocolo postgresql",
    };
  }
  const local =
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host.endsWith(".local");
  if (["ruts68_test", "test", "postgres"].includes(database)) {
    return {
      local,
      reserved: true,
      reason: "apunta a una base reservada para pruebas o administracion",
    };
  }
  return {
    local,
    reserved: false,
    reason: local ? "apunta a un host local" : undefined,
  };
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
    // same-server declara una topologia: PostgreSQL en esta misma maquina. Por
    // eso perdona el host de loopback y nada mas. Una URL mal formada, un
    // protocolo distinto o una base reservada siguen siendo errores; si no, el
    // opt-in dejaria de ser una declaracion y pasaria a apagar la validacion.
    const loopbackDeclarado =
      database.local &&
      !database.malformed &&
      !database.reserved &&
      env.DATABASE_LOCATION === "same-server";
    if ((database.local || database.reserved) && !loopbackDeclarado) {
      addIssue(issues, "DATABASE_URL", database.reason);
    }
  }

  const integraciones = parseDisabledIntegrations(env.DISABLED_INTEGRATIONS);
  for (const name of integraciones.unknown) {
    addIssue(
      issues,
      "DISABLED_INTEGRATIONS",
      `no reconoce "${name}"; valores validos: ${knownIntegrations.join(", ")}`,
    );
  }
  for (const [name, secrets] of Object.entries(integrationSecrets)) {
    if (integraciones.disabled.includes(name)) continue;
    for (const key of secrets) {
      if (!present(env[key]))
        addIssue(
          issues,
          key,
          `es requerido para produccion, o declara la integracion en DISABLED_INTEGRATIONS=${name}`,
        );
    }
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
      "DATABASE_LOCATION",
      "DISABLED_INTEGRATIONS",
      ...Object.values(integrationSecrets).flat(),
      "WHATSAPP_TOKEN_ENCRYPTION_KEY",
      "VISIT_PHOTO_STORAGE_MODE",
      "VISIT_PHOTO_S3_BUCKET",
      "VISIT_PHOTO_S3_REGION/AWS_REGION",
      "MAIL_TRANSPORT",
      "MAIL_FROM",
    ],
    disabledIntegrations: integraciones.disabled,
    issues,
  };
}

function render(result) {
  const lines = ["Ruts68 production preflight"];
  if (result.ok) {
    lines.push("OK: configuracion minima lista para ensayo de produccion.");
    // Un modulo apagado tiene que quedar escrito en la evidencia del
    // despliegue; si no, manana nadie distingue entre falta de credencial y
    // decision tomada.
    if ((result.disabledIntegrations ?? []).length > 0)
      lines.push(
        `Integraciones declaradas sin credenciales: ${result.disabledIntegrations.join(", ")}. Rechazan peticiones mientras sigan asi.`,
      );
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
