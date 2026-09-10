import { z } from "zod";
import { ActivityType } from "@prisma/client";
export const clientSchema = z
  .object({
    name: z.string().trim().min(2).max(160),
    contactName: z.string().trim().min(2).max(100),
    email: z.union([z.email(), z.literal("")]).optional(),
    phone: z.string().trim().min(5).max(30),
    city: z.string().trim().min(2).max(100),
    notes: z.string().max(3000).default(""),
    advisorId: z.uuid(),
  })
  .strict();
export const activitySchema = z
  .object({
    clientId: z.uuid(),
    type: z.enum(ActivityType),
    dueAt: z.iso.datetime({ offset: true }),
    notes: z.string().trim().min(2).max(3000),
    idempotencyKey: z.uuid(),
  })
  .strict();
export const completeSchema = z
  .object({
    outcome: z.enum(["contacted", "no_answer", "interested", "not_interested"]),
    notes: z.string().trim().min(2).max(3000),
    durationSeconds: z.number().int().min(0).max(86400),
    followUpAt: z.iso.datetime({ offset: true }).optional(),
    visitEvidence: z
      .object({
        start: z.object({
          latitude: z.number().min(-90).max(90),
          longitude: z.number().min(-180).max(180),
          accuracy: z.number().min(0).max(10000),
          capturedAt: z.iso.datetime({ offset: true }),
          address: z.string().trim().max(240).optional(),
        }),
        end: z.object({
          latitude: z.number().min(-90).max(90),
          longitude: z.number().min(-180).max(180),
          accuracy: z.number().min(0).max(10000),
          capturedAt: z.iso.datetime({ offset: true }),
        }),
        photoDataUrl: z
          .string()
          .regex(/^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/)
          .max(2_800_000),
      })
      .optional(),
  })
  .strict();
export const assignmentSchema = z.object({ advisorId: z.uuid() }).strict();
export const visitStartSchema = z
  .object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    accuracy: z.number().min(0).max(10000),
    capturedAt: z.iso.datetime({ offset: true }),
    address: z.string().trim().max(240).optional(),
  })
  .strict();
export const cancelSchema = z
  .object({ reason: z.string().trim().max(500).default("") })
  .strict();
export const idSchema = z.object({ id: z.uuid() });
export const listSchema = z.object({
  cursor: z.string().trim().min(1).max(240).optional(),
  search: z.string().max(100).default(""),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  advisorId: z.union([z.uuid(), z.literal("all")]).optional(),
  status: z.enum(["scheduled", "completed", "cancelled", "all"]).optional(),
});
