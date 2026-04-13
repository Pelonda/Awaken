import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireHQ } from "../middleware/auth";

export const devicesRouter = Router();

devicesRouter.post("/register", async (req, res) => {
  const schema = z.object({
    siteCode: z.string().min(1),
    hostname: z.string().min(1),
    name: z.string().min(1).optional(),
    clientVersion: z.string().optional()
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { siteCode, hostname, name, clientVersion } = parsed.data;

  const site = await prisma.site.findUnique({
    where: { siteCode }
  });

  if (!site) {
    return res.status(404).json({ error: "Site not found" });
  }

  const enrollmentCode = `ENR-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;

  const device = await prisma.device.upsert({
    where: {
      siteId_hostname: {
        siteId: site.id,
        hostname
      }
    },
    update: {
      name: name ?? hostname,
      clientVersion,
      isRegistered: true,
      status: "ONLINE",
      lastSeenAt: new Date()
    },
    create: {
      siteId: site.id,
      hostname,
      name: name ?? hostname,
      enrollmentCode,
      clientVersion,
      isRegistered: true,
      status: "ONLINE",
      mode: site.defaultMode
    }
  });

  return res.status(201).json({
    deviceId: device.id,
    name: device.name,
    hostname: device.hostname,
    mode: device.mode,
    status: device.status
  });
});

devicesRouter.get("/:siteId", requireHQ, async (req, res) => {
  const { siteId } = req.params;

  const devices = await prisma.device.findMany({
    where: { siteId },
    orderBy: { createdAt: "desc" }
  });

  return res.json(devices);
});

devicesRouter.post("/:deviceId/heartbeat", async (req, res) => {
  const schema = z.object({
    clientVersion: z.string().optional(),
    status: z.enum(["ONLINE", "OFFLINE", "LOCKED", "MAINTENANCE"]).optional()
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { deviceId } = req.params;

  const device = await prisma.device.update({
    where: { id: deviceId },
    data: {
      lastSeenAt: new Date(),
      clientVersion: parsed.data.clientVersion ?? undefined,
      status: parsed.data.status ?? "ONLINE"
    }
  });

  return res.json(device);
});