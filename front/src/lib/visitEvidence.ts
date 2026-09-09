import type { Activity } from "./types";

export type VisitEvidenceCapability = "location" | "photo" | "realtime";

export type VisitEvidenceCapabilityState = "not_configured";

export const visitEvidenceCapabilities: Record<
  VisitEvidenceCapability,
  VisitEvidenceCapabilityState
> = {
  location: "not_configured",
  photo: "not_configured",
  realtime: "not_configured",
};

export type VisitEvidenceStatus = {
  label: string;
  detail: string;
};

export function visitEvidenceStatus(
  activity: Pick<Activity, "type" | "status">,
): VisitEvidenceStatus | null {
  if (activity.type !== "visit") return null;
  if (activity.status === "cancelled")
    return {
      label: "Visita cancelada",
      detail: "Sin evidencia de ubicación, fotografía o tiempo real.",
    };
  if (activity.status === "completed")
    return {
      label: "Visita cerrada sin evidencia F4",
      detail: "Resultado guardado; ubicación y fotografía aún no se capturan.",
    };
  return {
    label: "Visita planificada",
    detail: "Ubicación, fotografía y tiempo real están preparados para F4.",
  };
}
