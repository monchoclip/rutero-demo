import type { Actor } from "../identity/IdentityTypes.js";
import { AppError } from "../shared/errors.js";
import { requireCommercial, requireWriter } from "../crm/CrmTypes.js";
import { CatalogRepository } from "./CatalogRepository.js";
import type { CampaignInput, ProductInput, ProductUpdate } from "./CatalogSchema.js";
import type { EventHub } from "../realtime/EventHub.js";

export class CatalogService {
  constructor(private repo: CatalogRepository, private realtime?: EventHub) {}
  products(actor: Actor) { return this.repo.products(actor); }
  async createProduct(actor: Actor, input: ProductInput) { requireCommercial(actor); const p = await this.repo.createProduct(actor, input); this.realtime?.publish({ organizationId: actor.organizationId!, type: "catalog.updated", resourceId: p.id }); return p; }
  async updateProduct(actor: Actor, id: string, input: ProductUpdate) { requireCommercial(actor); const result = await this.repo.updateProduct(actor, id, input); if (!result.count) throw new AppError(404, "NOT_FOUND", "Producto no encontrado."); this.realtime?.publish({ organizationId: actor.organizationId!, type: "catalog.updated", resourceId: id }); return this.repo.product(actor, id); }
  campaigns(actor: Actor) { return this.repo.campaigns(actor); }
  async createCampaign(actor: Actor, input: CampaignInput) { requireCommercial(actor); const c = await this.repo.createCampaign(actor, input); this.realtime?.publish({ organizationId: actor.organizationId!, type: "catalog.updated", resourceId: c.id }); return c; }
  async enroll(actor: Actor, campaignId: string, clientId: string) { requireWriter(actor); const existing = await this.repo.enroll(actor, campaignId, clientId); if (!existing) throw new AppError(404, "NOT_FOUND", "Campaña o cliente no disponible."); this.realtime?.publish({ organizationId: actor.organizationId!, type: "campaign.enrolled", resourceId: campaignId }); return existing; }
}
