import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireHQ } from "../middleware/auth";
import { io } from "../server";

export const announcementsRouter = Router();

announcementsRouter.post("/", requireHQ, async (req, res) => {
  const schema = z.object({
    siteId: z.string().min(1),
    title: z.string().min(1).max(120),
    message: z.string().min(1).max(5000),
    level: z.enum(["INFO", "WARNING", "CRITICAL"]).default("INFO"),
    targetType: z.enum(["SITE", "DEVICE"]).default("SITE"),
    targetId: z.string().optional(),
    expiresMinutes: z.number().int().positive().max(10080).optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { siteId, title, message, level, targetType, targetId, expiresMinutes } =
    parsed.data;

  const site = await prisma.site.findUnique({
    where: { id: siteId },
    include: {
      devices: {
        select: { id: true },
      },
    },
  });

  if (!site) {
    return res.status(404).json({ error: "Site not found" });
  }

  if (targetType === "DEVICE" && !targetId) {
    return res
      .status(400)
      .json({ error: "targetId is required for DEVICE announcements" });
  }

  const expiresAt = expiresMinutes
    ? new Date(Date.now() + expiresMinutes * 60 * 1000)
    : null;

  let targetDevices = site.devices;

  if (targetType === "DEVICE") {
    targetDevices = site.devices.filter((d) => d.id === targetId);
    if (!targetDevices.length) {
      return res
        .status(404)
        .json({ error: "Target device not found in site" });
    }
  }

  const result = await prisma.$transaction(async (tx) => {
    const announcement = await tx.announcement.create({
      data: {
        siteId,
        title,
        message,
        level,
        targetType,
        targetId: targetType === "DEVICE" ? targetId : null,
        expiresAt,
      },
    });

    if (targetDevices.length) {
      await tx.announcementDelivery.createMany({
        data: targetDevices.map((device) => ({
          announcementId: announcement.id,
          deviceId: device.id,
        })),
      });
    }

    await tx.auditLog.create({
      data: {
        siteId,
        deviceId: targetType === "DEVICE" ? targetId : undefined,
        action: "ANNOUNCEMENT_CREATED",
        details: {
          announcementId: announcement.id,
          title,
          level,
          targetType,
          targetId: targetType === "DEVICE" ? targetId : null,
          deviceCount: targetDevices.length,
        },
        ipAddress: req.ip,
      },
    });

    return { announcement, deviceCount: targetDevices.length };
  });

  // ✅ REAL-TIME EMIT
  io.to(`site:${siteId}`).emit("announcement:new", {
    announcementId: result.announcement.id,
    title,
    level,
  });

  return res.status(201).json({
    ok: true,
    announcementId: result.announcement.id,
    targetType,
    targetId: targetType === "DEVICE" ? targetId : null,
    deviceCount: result.deviceCount,
  });
});

/**
 * List announcements
 */
announcementsRouter.get("/site/:siteId", requireHQ, async (req, res) => {
  const { siteId } = req.params;

  const announcements = await prisma.announcement.findMany({
    where: { siteId },
    orderBy: { createdAt: "desc" },
  });

  return res.json({ ok: true, announcements });
});

/**
 * Deactivate announcement
 */
announcementsRouter.post(
  "/:announcementId/deactivate",
  requireHQ,
  async (req, res) => {
    const { announcementId } = req.params;

    const existing = await prisma.announcement.findUnique({
      where: { id: announcementId },
    });

    if (!existing) {
      return res.status(404).json({ error: "Announcement not found" });
    }

    await prisma.announcement.update({
      where: { id: announcementId },
      data: { isActive: false },
    });

    await prisma.auditLog.create({
      data: {
        siteId: existing.siteId,
        action: "ANNOUNCEMENT_DEACTIVATED",
        details: {
          announcementId,
        },
        ipAddress: req.ip,
      },
    });

    // ✅ REAL-TIME EMIT (optional but useful)
    io.to(`site:${existing.siteId}`).emit("announcement:update", {
      announcementId,
      isActive: false,
    });

    return res.json({
      ok: true,
      announcementId,
      isActive: false,
    });
  }
);