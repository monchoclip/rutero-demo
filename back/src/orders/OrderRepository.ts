import type { PrismaClient } from "@prisma/client";
import type { Actor } from "../identity/IdentityTypes.js";
import { tenantId, scope } from "../crm/CrmTypes.js";
import type { OrderInput } from "./OrderSchema.js";
export class OrderRepository {
  constructor(private db: PrismaClient) {}
  list(actor: Actor) { return this.db.order.findMany({ where: { organizationId: tenantId(actor), ...(actor.role === "advisor" ? { advisorId: actor.id } : {}) }, include: { client: { select: { id: true, name: true } }, advisor: { select: { id: true, name: true } }, lines: true }, orderBy: { createdAt: "desc" } }); }
  async create(actor: Actor, input: OrderInput) {
    return this.db.$transaction(async (tx) => {
      const existing = await tx.order.findUnique({ where: { organizationId_idempotencyKey: { organizationId: tenantId(actor), idempotencyKey: input.idempotencyKey } }, include: { lines: true, client: { select: { id: true, name: true } } } });
      if (existing) return existing;
      const client = await tx.client.findFirst({ where: { id: input.clientId, ...scope(actor) } });
      if (!client) return null;
      const products = await tx.product.findMany({ where: { organizationId: tenantId(actor), id: { in: input.lines.map((l) => l.productId) }, active: true } });
      if (products.length !== new Set(input.lines.map((l) => l.productId)).size) return null;
      const lines = input.lines.map((line) => { const p = products.find((candidate) => candidate.id === line.productId)!; return { productId: p.id, productCode: p.code, productName: p.name, unitPriceMinor: p.priceMinor, quantity: line.quantity, lineTotalMinor: p.priceMinor * line.quantity }; });
      return tx.order.create({ data: { organizationId: tenantId(actor), clientId: client.id, advisorId: client.advisorId, totalMinor: lines.reduce((sum, l) => sum + l.lineTotalMinor, 0), currency: client ? "COP" : "COP", idempotencyKey: input.idempotencyKey, lines: { create: lines } }, include: { lines: true, client: { select: { id: true, name: true } }, advisor: { select: { id: true, name: true } } } });
    });
  }
  find(actor: Actor, id: string) { return this.db.order.findFirst({ where: { id, organizationId: tenantId(actor), ...(actor.role === "advisor" ? { advisorId: actor.id } : {}) }, include: { lines: true, client: { select: { id: true, name: true } }, advisor: { select: { id: true, name: true } } } }); }
  markSubmitted(actor: Actor, id: string, result: { accepted: boolean; reference?: string; error?: string }) { return this.db.order.updateMany({ where: { id, organizationId: tenantId(actor), status: { in: ["draft", "error"] } }, data: result.accepted ? { status: "sent", erpReference: result.reference ?? null, erpError: null } : { status: "error", erpError: result.error ?? "ERP rechazó el pedido." } }); }
}
