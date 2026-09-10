import type { Handler } from "../shared/context.js";
import { OrderService } from "./OrderService.js";
import { orderIdSchema, orderSchema } from "./OrderSchema.js";
export function orderHandlers(orders: OrderService): Record<string, Handler> { return { orders: async (r) => orders.list(r.actor!), createOrder: async (r, reply) => { const result = await orders.create(r.actor!, orderSchema.parse(r.body)); reply.code(201); return result; }, submitOrder: async (r) => orders.submit(r.actor!, orderIdSchema.parse(r.params).id) }; }
