import { z } from "zod";

const date = z.string().datetime({ offset: true });
const productShape = {
  code: z.string().trim().min(1).max(40),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).default(""),
  priceMinor: z.number().int().min(0).max(2_000_000_000),
  currency: z.string().trim().length(3).default("COP"),
  validFrom: date.optional(),
  validTo: date.nullable().optional(),
  active: z.boolean().default(true),
};
export const productSchema = z.object(productShape).strict().superRefine((value, ctx) => {
  if (value.validFrom && value.validTo && new Date(value.validTo) <= new Date(value.validFrom)) ctx.addIssue({ code: "custom", path: ["validTo"], message: "La fecha final debe ser posterior a la inicial." });
});
export const productUpdateSchema = z.object(productShape).partial().strict().superRefine((value, ctx) => {
  if (value.validFrom && value.validTo && new Date(value.validTo) <= new Date(value.validFrom)) ctx.addIssue({ code: "custom", path: ["validTo"], message: "La fecha final debe ser posterior a la inicial." });
});
export const campaignSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).default(""),
  startsAt: date,
  endsAt: date.nullable().optional(),
  active: z.boolean().default(true),
  productIds: z.array(z.uuid()).max(100).default([]),
}).strict().superRefine((value, ctx) => {
  if (value.endsAt && new Date(value.endsAt) <= new Date(value.startsAt)) ctx.addIssue({ code: "custom", path: ["endsAt"], message: "La fecha final debe ser posterior al inicio." });
});
export const enrollmentSchema = z.object({ clientId: z.uuid() }).strict();
export type ProductInput = z.infer<typeof productSchema>;
export type ProductUpdate = z.infer<typeof productUpdateSchema>;
export type CampaignInput = z.infer<typeof campaignSchema>;
