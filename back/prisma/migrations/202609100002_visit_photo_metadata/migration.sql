ALTER TABLE "Activity" ADD COLUMN "visitPhotoStorageKey" TEXT;
ALTER TABLE "Activity" ADD COLUMN "visitPhotoSha256" TEXT;
ALTER TABLE "Activity" ADD COLUMN "visitPhotoContentType" TEXT;
ALTER TABLE "Activity" ADD COLUMN "visitPhotoSizeBytes" INTEGER;

CREATE INDEX "Activity_organizationId_visitPhotoStorageKey_idx" ON "Activity"("organizationId", "visitPhotoStorageKey");
