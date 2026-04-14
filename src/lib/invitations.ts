import crypto from "crypto";

export function generateInvitationToken() {
  return crypto.randomBytes(24).toString("hex");
}