import { z } from "zod";
export const emailSchema = z.email().trim().toLowerCase().max(254);
export const passwordSchema = z
  .string()
  .min(12, "Usa al menos 12 caracteres.")
  .max(128);
export const loginSchema = z
  .object({ email: emailSchema, password: passwordSchema })
  .strict();
export const registerSchema = loginSchema.extend({
  name: z.string().trim().min(2).max(100),
  companyName: z.string().trim().min(2).max(160),
  sector: z.enum([
    "food",
    "education",
    "health",
    "commerce",
    "services",
    "other",
  ]),
});
export const inviteSchema = z
  .object({ name: z.string().trim().min(2).max(100), email: emailSchema })
  .strict();
export const acceptSchema = z
  .object({
    token: z.string().regex(/^[a-f0-9]{64}$/),
    password: passwordSchema,
  })
  .strict();
