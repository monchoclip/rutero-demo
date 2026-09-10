CREATE TABLE "Product" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "priceMinor" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'COP',
  "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "validTo" TIMESTAMP(3),
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Product_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Product_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Product_organizationId_code_key" ON "Product"("organizationId", "code");
CREATE INDEX "Product_organizationId_active_validFrom_idx" ON "Product"("organizationId", "active", "validFrom");
CREATE TABLE "Campaign" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3),
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Campaign_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "Campaign_organizationId_active_startsAt_idx" ON "Campaign"("organizationId", "active", "startsAt");
CREATE TABLE "CampaignProduct" (
  "campaignId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "priceMinor" INTEGER NOT NULL,
  CONSTRAINT "CampaignProduct_pkey" PRIMARY KEY ("campaignId", "productId"),
  CONSTRAINT "CampaignProduct_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CampaignProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "CampaignEnrollment" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "advisorId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "enrolledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CampaignEnrollment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CampaignEnrollment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CampaignEnrollment_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CampaignEnrollment_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CampaignEnrollment_advisorId_fkey" FOREIGN KEY ("advisorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "CampaignEnrollment_campaignId_clientId_key" ON "CampaignEnrollment"("campaignId", "clientId");
CREATE INDEX "CampaignEnrollment_organizationId_clientId_status_idx" ON "CampaignEnrollment"("organizationId", "clientId", "status");
