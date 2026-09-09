ALTER TABLE "Organization" ADD COLUMN "moduleConfig" JSONB NOT NULL DEFAULT '{}';

CREATE TYPE "WhatsAppConnectionStatus" AS ENUM ('pending', 'verified', 'error');
ALTER TABLE "WhatsAppNumber" ADD COLUMN "businessAccountId" TEXT NOT NULL DEFAULT 'pending-waba';
ALTER TABLE "WhatsAppNumber" ADD COLUMN "connectionStatus" "WhatsAppConnectionStatus" NOT NULL DEFAULT 'pending';
ALTER TABLE "WhatsAppNumber" ADD COLUMN "lastVerifiedAt" TIMESTAMP(3);
ALTER TABLE "WhatsAppNumber" ADD COLUMN "lastConnectionError" TEXT;
ALTER TABLE "WhatsAppNumber" ALTER COLUMN "businessAccountId" DROP DEFAULT;
