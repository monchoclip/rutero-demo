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

export type VisitVerificationStatus =
  | "planned"
  | "closed_without_evidence"
  | "cancelled";

export type VisitActivityRef = {
  type: "call" | "visit" | "follow_up";
  status: "scheduled" | "completed" | "cancelled";
};

export type VisitLocationEvidenceDraft = {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  capturedAt: Date;
  source: "browser_geolocation";
  permission: "granted_by_user";
};

export type VisitPhotoEvidenceDraft = {
  storageKey: string;
  contentType: "image/jpeg" | "image/png" | "image/webp";
  capturedAt: Date;
};

export type VisitVerificationDraft = {
  activityId: string;
  status: VisitVerificationStatus;
  location: VisitLocationEvidenceDraft | null;
  photos: VisitPhotoEvidenceDraft[];
  realtimeAvailable: false;
};

export function visitVerificationStatus(
  activity: VisitActivityRef,
): VisitVerificationStatus | null {
  if (activity.type !== "visit") return null;
  if (activity.status === "cancelled") return "cancelled";
  if (activity.status === "completed") return "closed_without_evidence";
  return "planned";
}
