import { z } from "zod";

const date = z.string().datetime({ offset: true });
export const productSchema = z.object({
  code: z.string().trim().min(1).max(40),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).default(""),
  priceMinor: z.number().int().min(0).max(2_000_000_000),
  currency: z.string().trim().length(3).default("COP"),
  validFrom: date.optional(),
  validTo: date.nullable().optional(),
  active: z.boolean().default(true),
}).strict();
export const productUpdateSchema = productSchema.partial().strict();
export const campaignSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).default(""),
  startsAt: date,
  endsAt: date.nullable().optional(),
  active: z.boolean().default(true),
  productIds: z.array(z.uuid()).max(100).default([]),
}).strict();
export const enrollmentSchema = z.object({ clientId: z.uuid() }).strict();
export type ProductInput = z.infer<typeof productSchema>;
export type ProductUpdate = z.infer<typeof productUpdateSchema>;
export type CampaignInput = z.infer<typeof campaignSchema>;
