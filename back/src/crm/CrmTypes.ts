import type { Actor } from "../identity/IdentityTypes.js";
import { AppError } from "../shared/errors.js";
export function tenantId(actor: Actor) {
  if (!actor.organizationId)
    throw new AppError(
      403,
      "TENANT_REQUIRED",
      "Selecciona un contexto de empresa autorizado.",
    );
  return actor.organizationId;
}
export function requireCommercial(actor: Actor) {
  if (actor.role !== "commercial_coordinator")
    throw new AppError(
      403,
      "FORBIDDEN",
      "Esta acción requiere coordinación comercial.",
    );
}
export function requireWriter(actor: Actor) {
  if (!["commercial_coordinator", "advisor"].includes(actor.role))
    throw new AppError(
      403,
      "FORBIDDEN",
      "No tienes permisos para modificar la cartera.",
    );
}
export function scope(actor: Actor) {
  return {
    organizationId: tenantId(actor),
    ...(actor.role === "advisor" ? { advisorId: actor.id } : {}),
  };
}
export function activityScope(actor: Actor) {
  return {
    ...scope(actor),
    ...(actor.role === "advisor" ? { client: { advisorId: actor.id } } : {}),
  };
}
