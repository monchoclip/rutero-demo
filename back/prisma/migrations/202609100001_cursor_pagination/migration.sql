CREATE INDEX "Client_organizationId_advisorId_id_idx" ON "Client"("organizationId", "advisorId", "id");
CREATE INDEX "Client_organizationId_id_idx" ON "Client"("organizationId", "id");
CREATE INDEX "Activity_organizationId_advisorId_status_dueAt_id_idx" ON "Activity"("organizationId", "advisorId", "status", "dueAt", "id");
CREATE INDEX "Activity_organizationId_status_dueAt_id_idx" ON "Activity"("organizationId", "status", "dueAt", "id");