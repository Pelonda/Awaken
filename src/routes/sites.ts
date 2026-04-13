import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireHQ } from "../middleware/auth";

export const sitesRouter = Router();

sitesRouter.post("/", requireHQ, async (req, res) => {
  const schema = z.object({
    name: z.string().min(2),
    slug: z.string().min(2).regex(/^[a-z0-9-]+$/),
    defaultMode: z.enum(["STANDARD", "KIOSK"]).default("STANDARD")
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { name, slug, defaultMode } = parsed.data;

  const siteCode = `SITE-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

  const site = await prisma.site.create({
    data: {
      name,
      slug,
      siteCode,
      defaultMode
    }
  });

  return res.status(201).json(site);
});

sitesRouter.get("/", requireHQ, async (_req, res) => {
  const sites = await prisma.site.findMany({
    orderBy: { createdAt: "desc" }
  });

  return res.json(sites);
});

sitesRouter.post("/:siteId/members", requireHQ, async (req, res) => {
  const schema = z.object({
    email: z.string().email(),
    fullName: z.string().optional(),
    role: z.enum(["OWNER", "ADMIN", "OPERATOR", "VIEWER"]).default("VIEWER")
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { siteId } = req.params;
  const { email, fullName, role } = parsed.data;

  const user = await prisma.user.upsert({
    where: { email },
    update: { fullName: fullName ?? undefined },
    create: { email, fullName }
  });

  const member = await prisma.siteMember.upsert({
    where: {
      siteId_userId: {
        siteId,
        userId: user.id
      }
    },
    update: { role },
    create: {
      siteId,
      userId: user.id,
      role
    }
  });

  return res.status(201).json(member);
});