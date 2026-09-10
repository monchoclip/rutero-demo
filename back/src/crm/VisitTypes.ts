export type VisitEvidenceCapability = "location" | "photo" | "realtime";

export type VisitEvidenceCapabilityState = "available" | "not_configured";

export const visitEvidenceCapabilities: Record<
  VisitEvidenceCapability,
  VisitEvidenceCapabilityState
> = {
  location: "available",
  photo: "available",
  realtime: "not_configured",
};

export type VisitVerificationStatus =
  | "planned"
  | "in_progress"
  | "verified"
  | "out_of_range"
  | "closed_without_evidence"
  | "cancelled";

export type VisitActivityRef = {
  type: "call" | "visit" | "follow_up";
  status: "scheduled" | "completed" | "cancelled";
  visitStartedAt?: unknown;
  visitStartLatitude?: unknown;
  visitStartLongitude?: unknown;
  visitFinishedAt?: unknown;
  visitEndLatitude?: unknown;
  visitEndLongitude?: unknown;
  visitPhotoDataUrl?: unknown;
  visitDistanceMeters?: number | null;
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

export const VISIT_EVIDENCE_MAX_DISTANCE_METERS = 150;

function missing(value: unknown) {
  return value === null || value === undefined;
}

export function visitVerificationStatus(
  activity: VisitActivityRef,
): VisitVerificationStatus | null {
  if (activity.type !== "visit") return null;
  if (activity.status === "cancelled") return "cancelled";
  if (activity.status === "completed") {
    if (
      missing(activity.visitStartedAt) ||
      missing(activity.visitStartLatitude) ||
      missing(activity.visitStartLongitude) ||
      missing(activity.visitFinishedAt) ||
      missing(activity.visitEndLatitude) ||
      missing(activity.visitEndLongitude) ||
      missing(activity.visitPhotoDataUrl)
    )
      return "closed_without_evidence";
    return typeof activity.visitDistanceMeters === "number" &&
      activity.visitDistanceMeters > VISIT_EVIDENCE_MAX_DISTANCE_METERS
      ? "out_of_range"
      : "verified";
  }
  if (!missing(activity.visitStartedAt)) return "in_progress";
  return "planned";
}

export function distanceMeters(
  first: { latitude: number; longitude: number },
  second: { latitude: number; longitude: number },
) {
  const earthRadiusMeters = 6_371_000;
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const latDelta = toRadians(second.latitude - first.latitude);
  const lonDelta = toRadians(second.longitude - first.longitude);
  const firstLat = toRadians(first.latitude);
  const secondLat = toRadians(second.latitude);
  const haversine =
    Math.sin(latDelta / 2) ** 2 +
    Math.cos(firstLat) * Math.cos(secondLat) * Math.sin(lonDelta / 2) ** 2;
  return Math.round(
    earthRadiusMeters *
      2 *
      Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine)),
  );
}
