-- CreateEnum
CREATE TYPE "WhatsAppDirection" AS ENUM ('inbound', 'outbound');

-- CreateEnum
CREATE TYPE "WhatsAppMessageType" AS ENUM ('text', 'image', 'video', 'audio', 'document');

-- CreateEnum
CREATE TYPE "WhatsAppMessageStatus" AS ENUM ('queued', 'sent', 'delivered', 'read', 'failed', 'received');

-- CreateTable
CREATE TABLE "WhatsAppNumber" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "phoneNumberId" TEXT NOT NULL,
    "displayPhoneNumber" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "accessTokenCipher" TEXT NOT NULL,
    "advisorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppNumber_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppConversation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "whatsAppNumberId" TEXT NOT NULL,
    "contactPhone" TEXT NOT NULL,
    "contactName" TEXT,
    "clientId" TEXT,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppMessage" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "direction" "WhatsAppDirection" NOT NULL,
    "type" "WhatsAppMessageType" NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "mediaId" TEXT,
    "mediaUrl" TEXT,
    "waMessageId" TEXT,
    "status" "WhatsAppMessageStatus" NOT NULL DEFAULT 'queued',
    "senderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsAppMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppNumber_phoneNumberId_key" ON "WhatsAppNumber"("phoneNumberId");

-- CreateIndex
CREATE INDEX "WhatsAppNumber_organizationId_idx" ON "WhatsAppNumber"("organizationId");

-- CreateIndex
CREATE INDEX "WhatsAppConversation_organizationId_lastMessageAt_idx" ON "WhatsAppConversation"("organizationId", "lastMessageAt");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppConversation_whatsAppNumberId_contactPhone_key" ON "WhatsAppConversation"("whatsAppNumberId", "contactPhone");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppMessage_waMessageId_key" ON "WhatsAppMessage"("waMessageId");

-- CreateIndex
CREATE INDEX "WhatsAppMessage_conversationId_createdAt_idx" ON "WhatsAppMessage"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "WhatsAppMessage_organizationId_idx" ON "WhatsAppMessage"("organizationId");

-- AddForeignKey
ALTER TABLE "WhatsAppNumber" ADD CONSTRAINT "WhatsAppNumber_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppNumber" ADD CONSTRAINT "WhatsAppNumber_organizationId_advisorId_fkey" FOREIGN KEY ("organizationId", "advisorId") REFERENCES "User"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppConversation" ADD CONSTRAINT "WhatsAppConversation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppConversation" ADD CONSTRAINT "WhatsAppConversation_whatsAppNumberId_fkey" FOREIGN KEY ("whatsAppNumberId") REFERENCES "WhatsAppNumber"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppConversation" ADD CONSTRAINT "WhatsAppConversation_organizationId_clientId_fkey" FOREIGN KEY ("organizationId", "clientId") REFERENCES "Client"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppMessage" ADD CONSTRAINT "WhatsAppMessage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppMessage" ADD CONSTRAINT "WhatsAppMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "WhatsAppConversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppMessage" ADD CONSTRAINT "WhatsAppMessage_organizationId_senderId_fkey" FOREIGN KEY ("organizationId", "senderId") REFERENCES "User"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
