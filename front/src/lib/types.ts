export type User = {
  id: string;
  name: string;
  email: string;
  role:
    | "super_admin"
    | "commercial_coordinator"
    | "administrative_coordinator"
    | "advisor";
  active: boolean;
};
export type Organization = {
  id: string;
  name: string;
  sector: string;
  trialEndsAt: string;
  timeZone: string;
  membershipPlan: string | null;
  membershipStatus: "trial" | "active" | "past_due" | "cancelled";
  membershipStartedAt: string | null;
  membershipEndsAt: string | null;
  moduleConfig: ModuleConfig;
};
export type ModuleKey =
  | "overview"
  | "sequence"
  | "clients"
  | "agenda"
  | "team"
  | "chats"
  | "billing"
  | "mail";
export type ModuleConfig = Record<ModuleKey, boolean>;
export type Client = {
  id: string;
  name: string;
  contactName: string;
  email: string | null;
  phone: string;
  city: string;
  notes: string;
  advisorId: string;
  advisor: User;
  createdAt: string;
};
export type Activity = {
  id: string;
  clientId: string;
  type: "call" | "visit" | "follow_up";
  status: "scheduled" | "completed" | "cancelled";
  dueAt: string;
  notes: string;
  outcome: string | null;
  durationSeconds: number | null;
  visitStartedAt: string | null;
  visitStartLatitude: number | null;
  visitStartLongitude: number | null;
  visitStartAccuracy: number | null;
  visitStartAddress: string | null;
  visitFinishedAt: string | null;
  visitEndLatitude: number | null;
  visitEndLongitude: number | null;
  visitEndAccuracy: number | null;
  visitPhotoDataUrl: string | null;
  visitDistanceMeters: number | null;
  createdAt: string;
  completedAt: string | null;
  client: { name: string };
  advisor: User;
};
export type Mail = {
  id: string;
  recipient: string;
  subject: string;
  body: string;
  sentAt: string | null;
  cancelledAt: string | null;
  availableAt: string;
};
export type Invitation = {
  id: string;
  name: string;
  email: string;
  expiresAt: string;
};
export const roleLabels: Record<User["role"], string> = {
  super_admin: "Superadministrador",
  commercial_coordinator: "Coordinador comercial",
  administrative_coordinator: "Coordinador administrativo",
  advisor: "Asesor",
};
export const activityLabels = {
  call: "Llamada",
  visit: "Visita",
  follow_up: "Seguimiento",
};
export const activityStatusLabels: Record<Activity["status"], string> = {
  scheduled: "Programado",
  completed: "Realizado",
  cancelled: "Cancelado",
};
export const activityOutcomeLabels: Record<string, string> = {
  contacted: "Contacto realizado",
  no_answer: "No respondió",
  interested: "Tiene interés",
  not_interested: "Sin interés por ahora",
};
export type BillingPlan = {
  id: "essential" | "growth" | "enterprise";
  name: string;
  baseMinor: number;
  includedUsers: number;
  userMinor: number;
};
export type BillingConfiguration = {
  mode: "simulation";
  currency: string;
  trialMonths: number;
  supportFixedMinor: number;
  supportBps: number;
  gatewayFixedMinor: number;
  gatewayBps: number;
  taxBps: number;
  plans: BillingPlan[];
};
export type BillingSettings = {
  version: number;
  configuration: BillingConfiguration;
};
export type BillingQuote = {
  version: number;
  mode: "simulation";
  currency: string;
  planId: BillingPlan["id"];
  planName: string;
  users: number;
  includedUsers: number;
  additionalUsers: number;
  baseMinor: number;
  extraUsersMinor: number;
  subtotalMinor: number;
  supportMinor: number;
  gatewayMinor: number;
  taxMinor: number;
  totalMinor: number;
};
export type SimulationOutcome = "approved" | "declined" | "pending";
export type PaymentSimulation = {
  id: string;
  configurationVersion: number;
  outcome: SimulationOutcome;
  snapshot: { quote: BillingQuote };
  createdAt: string;
};
export type BillingCheckout = {
  mode: "simulation" | "wompi";
  reference: string;
  quote: BillingQuote;
  customerData: {
    email: string;
    fullName: string;
    phoneNumber?: string;
    legalId?: string;
    legalIdType?: string;
  };
  publicKey?: string;
  signatureIntegrity?: string;
  redirectUrl?: string;
};
export type PaymentTransaction = {
  id: string;
  reference: string;
  transactionId: string | null;
  status: "pending" | "approved" | "declined" | "error" | "voided";
  amountInCents: number;
  currency: string;
  planId: string;
  users: number;
  customerName: string;
  customerEmail: string;
  createdAt: string;
  updatedAt: string;
};
export const outcomeLabels: Record<SimulationOutcome, string> = {
  approved: "Aprobado",
  declined: "Rechazado",
  pending: "Pendiente",
};
export type WhatsAppNumber = {
  id: string;
  phoneNumberId: string;
  businessAccountId: string;
  displayPhoneNumber: string;
  label: string;
  connectionStatus: "pending" | "verified" | "error";
  lastVerifiedAt: string | null;
  lastConnectionError: string | null;
  advisor: User | null;
};
export type PlatformWhatsAppNumber = WhatsAppNumber & {
  organization: { id: string; name: string };
};
export type PlatformOrganization = {
  id: string;
  name: string;
  sector: string;
  membershipPlan: string | null;
  membershipStatus: string;
  membershipStartedAt: string | null;
  membershipEndsAt: string | null;
  trialEndsAt: string;
  _count: { users: number; clients: number };
  moduleConfig: ModuleConfig;
};
export type WhatsAppConversation = {
  id: string;
  contactPhone: string;
  contactName: string | null;
  lastMessageAt: string;
  whatsAppNumber: { id: string; label: string; advisorId: string | null };
  client: { id: string; name: string } | null;
};
export type WhatsAppMessageType =
  | "text"
  | "image"
  | "video"
  | "audio"
  | "document";
export type WhatsAppMessageStatus =
  | "queued"
  | "sent"
  | "delivered"
  | "read"
  | "failed"
  | "received";
export type WhatsAppMessage = {
  id: string;
  direction: "inbound" | "outbound";
  type: WhatsAppMessageType;
  body: string;
  mediaId: string | null;
  mediaUrl: string | null;
  waMessageId: string | null;
  status: WhatsAppMessageStatus;
  sender: User | null;
  createdAt: string;
};
export type WhatsAppTemplateRequest = {
  templateName: string;
  languageCode: string;
  variables: string[];
};
