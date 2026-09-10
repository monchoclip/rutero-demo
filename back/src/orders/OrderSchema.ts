import { z } from "zod";
export const orderLineSchema = z.object({ productId: z.uuid(), quantity: z.number().int().min(1).max(10000) }).strict();
export const orderSchema = z.object({ clientId: z.uuid(), idempotencyKey: z.uuid(), lines: z.array(orderLineSchema).min(1).max(100) }).strict();
export const orderIdSchema = z.object({ id: z.uuid() }).strict();
export type OrderInput = z.infer<typeof orderSchema>;
