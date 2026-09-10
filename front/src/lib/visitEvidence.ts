import type { Activity } from "./types";

export type VisitEvidenceCapability = "location" | "photo" | "realtime";

export type VisitEvidenceCapabilityState = "available" | "manual_only";

export const visitEvidenceCapabilities: Record<
  VisitEvidenceCapability,
  VisitEvidenceCapabilityState
> = {
  location: "available",
  photo: "available",
  realtime: "manual_only",
};

export type VisitEvidenceStatus = {
  label: string;
  detail: string;
};

export function visitEvidenceStatus(
  activity: Pick<
    Activity,
    | "type"
    | "status"
    | "visitStartedAt"
    | "visitFinishedAt"
    | "visitPhotoDataUrl"
    | "visitDistanceMeters"
  >,
): VisitEvidenceStatus | null {
  if (activity.type !== "visit") return null;
  if (activity.status === "cancelled")
    return {
      label: "Visita cancelada",
      detail: "Sin evidencia activa.",
    };
  if (activity.status === "completed")
    return activity.visitFinishedAt && activity.visitPhotoDataUrl
      ? {
          label: "Visita verificada",
          detail:
            typeof activity.visitDistanceMeters === "number"
              ? `Inicio y cierre a ${activity.visitDistanceMeters} m.`
              : "Ubicación y fotografía guardadas.",
        }
      : {
          label: "Visita cerrada sin evidencia",
          detail: "Resultado guardado sin ubicación o fotografía.",
        };
  if (activity.visitStartedAt)
    return {
      label: "Visita iniciada",
      detail: "Ubicación inicial capturada; falta cierre con foto.",
    };
  return {
    label: "Visita planificada",
    detail: "Lista para iniciar con ubicación del dispositivo.",
  };
}
