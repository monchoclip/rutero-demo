import { z } from "zod";
export const registerNumberSchema = z
  .object({
    organizationId: z.uuid(),
    businessAccountId: z
      .string()
      .trim()
      .min(5)
      .max(80)
      .optional()
      .default("unknown-waba"),
    phoneNumberId: z.string().trim().min(5).max(40),
    displayPhoneNumber: z.string().trim().min(5).max(30),
    label: z.string().trim().min(2).max(80),
    accessToken: z.string().trim().min(20).max(4000),
  })
  .strict();
export const verifyNumberSchema = z.object({ id: z.uuid() }).strict();
export const assignmentSchema = z
  .object({ advisorId: z.uuid().nullable() })
  .strict();
export const sendMessageSchema = z
  .object({ body: z.string().trim().min(1).max(4096) })
  .strict();
export const templateMessageSchema = z
  .object({
    templateName: z
      .string()
      .trim()
      .min(2)
      .max(512)
      .regex(/^[a-z0-9_]+$/),
    languageCode: z
      .string()
      .trim()
      .min(2)
      .max(20)
      .regex(/^[a-z]{2,3}(_[A-Z]{2})?$/),
    variables: z.array(z.string().trim().max(1024)).max(10).default([]),
  })
  .strict();
