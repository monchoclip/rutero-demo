import type { Actor } from "../identity/IdentityTypes.js";
import { AppError } from "../shared/errors.js";
import { requireWriter } from "../crm/CrmTypes.js";
import type { EventHub } from "../realtime/EventHub.js";
import { OrderRepository } from "./OrderRepository.js";
import { SimulatedErpAdapter, type ErpAdapter } from "./ErpAdapter.js";
import type { OrderInput } from "./OrderSchema.js";
export class OrderService {
  constructor(private repo: OrderRepository, private erp: ErpAdapter = new SimulatedErpAdapter(), private realtime?: EventHub) {}
  list(actor: Actor) { return this.repo.list(actor); }
  async create(actor: Actor, input: OrderInput) { requireWriter(actor); const order = await this.repo.create(actor, input); if (!order) throw new AppError(404, "NOT_FOUND", "Cliente o producto no disponible."); return order; }
  async submit(actor: Actor, id: string) { requireWriter(actor); const order = await this.repo.find(actor, id); if (!order) throw new AppError(404, "NOT_FOUND", "Pedido no encontrado."); if (order.status === "sent") return order; const result = await this.erp.submit(order); const updated = await this.repo.markSubmitted(actor, id, result); if (!updated.count) return this.repo.find(actor, id); this.realtime?.publish({ organizationId: actor.organizationId!, type: "order.updated", resourceId: id }); return this.repo.find(actor, id); }
}
