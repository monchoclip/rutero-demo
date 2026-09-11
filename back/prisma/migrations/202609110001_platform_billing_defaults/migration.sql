CREATE TABLE "PlatformBillingSettings" (
  "id" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "configuration" JSONB NOT NULL,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlatformBillingSettings_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "PlatformBillingSettings" ADD CONSTRAINT "PlatformBillingSettings_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "PlatformBillingSettings" ("id", "configuration", "updatedAt")
VALUES (
  'default',
  '{"mode":"simulation","currency":"COP","trialMonths":1,"supportFixedMinor":0,"supportBps":500,"gatewayFixedMinor":90000,"gatewayBps":290,"taxBps":0,"plans":[{"id":"essential","name":"Esencial","baseMinor":4900000,"includedUsers":2,"userMinor":1900000},{"id":"growth","name":"Crecimiento","baseMinor":12900000,"includedUsers":5,"userMinor":1500000},{"id":"enterprise","name":"Organización","baseMinor":24900000,"includedUsers":10,"userMinor":1200000}]}'::jsonb,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("id") DO NOTHING;

CREATE TABLE "PlatformAuditEvent" (
  "id" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "resourceId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlatformAuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PlatformAuditEvent_actorId_createdAt_idx" ON "PlatformAuditEvent"("actorId", "createdAt");

ALTER TABLE "PlatformAuditEvent" ADD CONSTRAINT "PlatformAuditEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
