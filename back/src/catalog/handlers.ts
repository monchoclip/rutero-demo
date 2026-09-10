import type { Handler } from "../shared/context.js";
import { CatalogService } from "./CatalogService.js";
import { campaignSchema, enrollmentSchema, productSchema, productUpdateSchema } from "./CatalogSchema.js";
import { idSchema } from "../crm/CrmSchema.js";
export function catalogHandlers(catalog: CatalogService): Record<string, Handler> {
  return {
    products: async (r) => catalog.products(r.actor!),
    createProduct: async (r, reply) => { const result = await catalog.createProduct(r.actor!, productSchema.parse(r.body)); reply.code(201); return result; },
    updateProduct: async (r) => catalog.updateProduct(r.actor!, idSchema.parse(r.params).id, productUpdateSchema.parse(r.body)),
    campaigns: async (r) => catalog.campaigns(r.actor!),
    createCampaign: async (r, reply) => { const result = await catalog.createCampaign(r.actor!, campaignSchema.parse(r.body)); reply.code(201); return result; },
    enrollCampaign: async (r, reply) => { const result = await catalog.enroll(r.actor!, idSchema.parse(r.params).id, enrollmentSchema.parse(r.body).clientId); reply.code(201); return result; },
  };
}
