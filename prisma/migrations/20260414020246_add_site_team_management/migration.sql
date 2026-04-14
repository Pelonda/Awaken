-- CreateIndex
CREATE INDEX "SiteMember_siteId_role_idx" ON "SiteMember"("siteId", "role");

-- CreateIndex
CREATE INDEX "SiteMember_invitedEmail_idx" ON "SiteMember"("invitedEmail");

-- CreateIndex
CREATE INDEX "SiteMember_invitationToken_idx" ON "SiteMember"("invitationToken");
