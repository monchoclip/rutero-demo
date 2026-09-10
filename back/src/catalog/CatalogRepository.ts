import type { PrismaClient } from "@prisma/client";
import type { Actor } from "../identity/IdentityTypes.js";
import { tenantId } from "../crm/CrmTypes.js";
import { AppError } from "../shared/errors.js";
import type { CampaignInput, ProductInput, ProductUpdate } from "./CatalogSchema.js";

export class CatalogRepository {
  constructor(private db: PrismaClient) {}
  products(actor: Actor) {
    return this.db.product.findMany({ where: { organizationId: tenantId(actor) }, orderBy: [{ active: "desc" }, { name: "asc" }] });
  }
  product(actor: Actor, id: string) {
    return this.db.product.findFirst({ where: { id, organizationId: tenantId(actor) } });
  }
  createProduct(actor: Actor, input: ProductInput) {
    return this.db.product.create({ data: { ...input, organizationId: tenantId(actor), validFrom: input.validFrom ? new Date(input.validFrom) : undefined, validTo: input.validTo ? new Date(input.validTo) : null } });
  }
  updateProduct(actor: Actor, id: string, input: ProductUpdate) {
    const { validFrom, validTo, ...rest } = input;
    return this.db.product.updateMany({
      where: { id, organizationId: tenantId(actor) },
      data: {
        ...rest,
        ...(validFrom !== undefined ? { validFrom: new Date(validFrom) } : {}),
        ...(validTo !== undefined ? { validTo: validTo ? new Date(validTo) : null } : {}),
      },
    });
  }
  campaigns(actor: Actor) {
    return this.db.campaign.findMany({ where: { organizationId: tenantId(actor) }, include: { products: { include: { product: true } }, enrollments: { where: actor.role === "advisor" ? { advisorId: actor.id } : undefined, include: { client: { select: { id: true, name: true } }, advisor: { select: { id: true, name: true } } } } }, orderBy: [{ active: "desc" }, { startsAt: "desc" }] });
  }
  createCampaign(actor: Actor, input: CampaignInput) {
    return this.db.$transaction(async (tx) => {
      const products = input.productIds.length ? await tx.product.findMany({ where: { id: { in: input.productIds }, organizationId: tenantId(actor), active: true } }) : [];
      if (products.length !== new Set(input.productIds).size) throw new AppError(422, "INVALID_PRODUCT", "Uno o más productos no están disponibles.");
      const campaign = await tx.campaign.create({ data: { organizationId: tenantId(actor), name: input.name, description: input.description, startsAt: new Date(input.startsAt), endsAt: input.endsAt ? new Date(input.endsAt) : null, active: input.active, products: { create: products.map((p) => ({ productId: p.id, priceMinor: p.priceMinor })) } }, include: { products: { include: { product: true } } } });
      return campaign;
    });
  }
  enroll(actor: Actor, campaignId: string, clientId: string) {
    return this.db.$transaction(async (tx) => {
      const now = new Date();
      const campaign = await tx.campaign.findFirst({ where: { id: campaignId, organizationId: tenantId(actor), active: true, startsAt: { lte: now }, OR: [{ endsAt: null }, { endsAt: { gt: now } }] }, include: { products: true } });
      if (!campaign) return null;
      const client = await tx.client.findFirst({ where: { id: clientId, organizationId: tenantId(actor), ...(actor.role === "advisor" ? { advisorId: actor.id } : {}) } });
      if (!client) return null;
      return tx.campaignEnrollment.create({ data: { organizationId: tenantId(actor), campaignId, clientId, advisorId: client.advisorId }, include: { campaign: true, client: { select: { id: true, name: true } }, advisor: { select: { id: true, name: true } } } });
    });
  }
}
