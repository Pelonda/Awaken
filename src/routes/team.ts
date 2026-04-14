import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireHQ, requireUser, requireSitePermission } from "../middleware/auth";
import { generateInvitationToken } from "../lib/invitations";

export const teamRouter = Router();

teamRouter.get("/sites/:siteId/members/hq", requireHQ, async (req, res) => {
  const { siteId } = req.params;

  const members = await prisma.siteMember.findMany({
    where: { siteId },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          fullName: true,
          isActive: true,
          createdAt: true,
        },
      },
    },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
  });

  return res.json({ ok: true, members });
});

teamRouter.get(
  "/sites/:siteId/members",
  requireUser,
  requireSitePermission((req) => req.params.siteId, "team.read"),
  async (req, res) => {
    const { siteId } = req.params;

    const members = await prisma.siteMember.findMany({
      where: { siteId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            fullName: true,
            isActive: true,
            createdAt: true,
          },
        },
      },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    });

    return res.json({ ok: true, members });
  }
);

teamRouter.post("/sites/:siteId/members/invite/hq", requireHQ, async (req, res) => {
  return inviteMember(req, res);
});

teamRouter.post(
  "/sites/:siteId/members/invite",
  requireUser,
  requireSitePermission((req) => req.params.siteId, "team.manage"),
  async (req, res) => {
    return inviteMember(req, res);
  }
);

async function inviteMember(req: any, res: any) {
  const schema = z.object({
    email: z.string().email(),
    fullName: z.string().optional(),
    role: z.enum(["OWNER", "ADMIN", "OPERATOR", "VIEWER"]).default("VIEWER"),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { siteId } = req.params;
  const { email, fullName, role } = parsed.data;

  const site = await prisma.site.findUnique({
    where: { id: siteId },
  });

  if (!site) {
    return res.status(404).json({ error: "Site not found" });
  }

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      fullName: fullName ?? undefined,
    },
    create: {
      email,
      fullName,
    },
  });

  const token = generateInvitationToken();

  const membership = await prisma.siteMember.upsert({
    where: {
      siteId_userId: {
        siteId,
        userId: user.id,
      },
    },
    update: {
      role,
      invitedEmail: email,
      invitationToken: token,
      acceptedAt: null,
    },
    create: {
      siteId,
      userId: user.id,
      role,
      invitedEmail: email,
      invitationToken: token,
      acceptedAt: null,
    },
  });

  await prisma.auditLog.create({
    data: {
      siteId,
      actorId: req.awakenUser?.id ?? null,
      action: "SITE_MEMBER_INVITED",
      details: {
        membershipId: membership.id,
        email,
        role,
      },
      ipAddress: req.ip,
    },
  });

  return res.status(201).json({
    ok: true,
    membershipId: membership.id,
    siteId,
    email,
    role,
    invitationToken: token,
    message: "Invitation created successfully.",
  });
}

teamRouter.post("/invitations/accept", async (req, res) => {
  const schema = z.object({
    token: z.string().min(10),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { token } = parsed.data;

  const membership = await prisma.siteMember.findFirst({
    where: {
      invitationToken: token,
    },
    include: {
      site: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
      user: {
        select: {
          id: true,
          email: true,
          fullName: true,
        },
      },
    },
  });

  if (!membership) {
    return res.status(404).json({ error: "Invitation not found" });
  }

  if (membership.acceptedAt) {
    return res.json({
      ok: true,
      alreadyAccepted: true,
      site: membership.site,
      user: membership.user,
      role: membership.role,
    });
  }

  const updated = await prisma.siteMember.update({
    where: { id: membership.id },
    data: {
      acceptedAt: new Date(),
    },
  });

  await prisma.auditLog.create({
    data: {
      siteId: membership.siteId,
      actorId: membership.userId,
      action: "SITE_MEMBER_ACCEPTED_INVITATION",
      details: {
        membershipId: membership.id,
        role: membership.role,
      },
      ipAddress: req.ip,
    },
  });

  return res.json({
    ok: true,
    membershipId: updated.id,
    site: membership.site,
    user: membership.user,
    role: membership.role,
    acceptedAt: updated.acceptedAt,
  });
});

teamRouter.patch("/members/:memberId/role/hq", requireHQ, async (req, res) => {
  return updateRole(req, res);
});

teamRouter.patch(
  "/members/:memberId/role",
  requireUser,
  async (req, res, next) => {
    const member = await prisma.siteMember.findUnique({
      where: { id: req.params.memberId },
      select: { siteId: true },
    });

    if (!member) {
      return res.status(404).json({ error: "Member not found" });
    }

    req.targetSiteId = member.siteId;
    next();
  },
  requireSitePermission((req) => req.targetSiteId, "team.manage"),
  async (req, res) => {
    return updateRole(req, res);
  }
);

async function updateRole(req: any, res: any) {
  const schema = z.object({
    role: z.enum(["OWNER", "ADMIN", "OPERATOR", "VIEWER"]),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { memberId } = req.params;
  const { role } = parsed.data;

  const existing = await prisma.siteMember.findUnique({
    where: { id: memberId },
  });

  if (!existing) {
    return res.status(404).json({ error: "Member not found" });
  }

  const updated = await prisma.siteMember.update({
    where: { id: memberId },
    data: { role },
  });

  await prisma.auditLog.create({
    data: {
      siteId: existing.siteId,
      actorId: req.awakenUser?.id ?? null,
      action: "SITE_MEMBER_ROLE_UPDATED",
      details: {
        membershipId: memberId,
        role,
      },
      ipAddress: req.ip,
    },
  });

  return res.json({
    ok: true,
    memberId: updated.id,
    role: updated.role,
  });
}

teamRouter.delete("/members/:memberId/hq", requireHQ, async (req, res) => {
  return removeMember(req, res);
});

teamRouter.delete(
  "/members/:memberId",
  requireUser,
  async (req, res, next) => {
    const member = await prisma.siteMember.findUnique({
      where: { id: req.params.memberId },
      select: { siteId: true },
    });

    if (!member) {
      return res.status(404).json({ error: "Member not found" });
    }

    req.targetSiteId = member.siteId;
    next();
  },
  requireSitePermission((req) => req.targetSiteId, "team.manage"),
  async (req, res) => {
    return removeMember(req, res);
  }
);

async function removeMember(req: any, res: any) {
  const { memberId } = req.params;

  const existing = await prisma.siteMember.findUnique({
    where: { id: memberId },
  });

  if (!existing) {
    return res.status(404).json({ error: "Member not found" });
  }

  await prisma.siteMember.delete({
    where: { id: memberId },
  });

  await prisma.auditLog.create({
    data: {
      siteId: existing.siteId,
      actorId: req.awakenUser?.id ?? null,
      action: "SITE_MEMBER_REMOVED",
      details: {
        membershipId: memberId,
        userId: existing.userId,
      },
      ipAddress: req.ip,
    },
  });

  return res.json({
    ok: true,
    memberId,
    removed: true,
  });
}