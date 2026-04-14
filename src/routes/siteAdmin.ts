import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireUser, requireSitePermission } from "../middleware/auth";
import { io } from "../server";

export const siteAdminRouter = Router();

/**
 * Site overview / report summary
 */
siteAdminRouter.get(
  "/sites/:siteId/overview",
  requireUser,
  requireSitePermission((req) => req.params.siteId, "site.read"),
  async (req, res) => {
    const { siteId } = req.params;

    const [site, deviceCount, activeSessions, bookingCount, activeAnnouncements] =
      await Promise.all([
        prisma.site.findUnique({
          where: { id: siteId },
          select: {
            id: true,
            name: true,
            slug: true,
            siteCode: true,
            defaultMode: true,
            isActive: true,
            createdAt: true,
          },
        }),
        prisma.device.count({ where: { siteId } }),
        prisma.session.count({
          where: { siteId, status: "ACTIVE" },
        }),
        prisma.booking.count({ where: { siteId } }),
        prisma.announcement.count({
          where: {
            siteId,
            isActive: true,
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          },
        }),
      ]);

    if (!site) {
      return res.status(404).json({ error: "Site not found" });
    }

    return res.json({
      ok: true,
      site,
      stats: {
        deviceCount,
        activeSessions,
        bookingCount,
        activeAnnouncements,
      },
    });
  }
);

/**
 * List devices for site
 */
siteAdminRouter.get(
  "/sites/:siteId/devices",
  requireUser,
  requireSitePermission((req) => req.params.siteId, "devices.read"),
  async (req, res) => {
    const { siteId } = req.params;

    const devices = await prisma.device.findMany({
      where: { siteId },
      orderBy: { createdAt: "asc" },
    });

    return res.json({ ok: true, devices });
  }
);

/**
 * Booking list
 */
siteAdminRouter.get(
  "/sites/:siteId/bookings",
  requireUser,
  requireSitePermission((req) => req.params.siteId, "pins.read"),
  async (req, res) => {
    const { siteId } = req.params;

    const bookings = await prisma.booking.findMany({
      where: { siteId },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        user: { select: { id: true, email: true, fullName: true } },
        device: { select: { id: true, name: true, hostname: true } },
        pins: {
          where: { isActive: true },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { id: true, expiresAt: true, isActive: true },
        },
      },
    });

    return res.json({ ok: true, bookings });
  }
);

/**
 * List sessions
 */
siteAdminRouter.get(
  "/sites/:siteId/sessions",
  requireUser,
  requireSitePermission((req) => req.params.siteId, "sessions.read"),
  async (req, res) => {
    const { siteId } = req.params;

    const sessions = await prisma.session.findMany({
      where: { siteId },
      orderBy: { startedAt: "desc" },
      take: 100,
    });

    return res.json({ ok: true, sessions });
  }
);

/**
 * Create announcement
 */
siteAdminRouter.post(
  "/sites/:siteId/announcements",
  requireUser,
  requireSitePermission((req) => req.params.siteId, "announcements.manage"),
  async (req, res) => {
    const schema = z.object({
      title: z.string().min(1),
      message: z.string().min(1),
      level: z.enum(["INFO", "WARNING", "CRITICAL"]).default("INFO"),
      targetType: z.enum(["SITE", "DEVICE"]).default("SITE"),
      targetId: z.string().optional(),
      expiresMinutes: z.number().optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const { siteId } = req.params;
    const { title, message, level, targetType, targetId, expiresMinutes } =
      parsed.data;

    const site = await prisma.site.findUnique({
      where: { id: siteId },
      include: { devices: { select: { id: true } } },
    });

    if (!site) return res.status(404).json({ error: "Site not found" });

    let targetDevices = site.devices;

    if (targetType === "DEVICE") {
      targetDevices = site.devices.filter((d) => d.id === targetId);
    }

    const expiresAt = expiresMinutes
      ? new Date(Date.now() + expiresMinutes * 60000)
      : null;

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

      await tx.announcementDelivery.createMany({
        data: targetDevices.map((d) => ({
          announcementId: announcement.id,
          deviceId: d.id,
        })),
      });

      return { announcement, deviceCount: targetDevices.length };
    });

    // ✅ REAL-TIME
    io.to(`site:${siteId}`).emit("announcement:new", {
      announcementId: result.announcement.id,
      title,
      level,
    });

    return res.status(201).json({
      ok: true,
      announcementId: result.announcement.id,
    });
  }
);

/**
 * End session
 */
siteAdminRouter.post(
  "/sites/:siteId/sessions/:sessionId/end",
  requireUser,
  requireSitePermission((req) => req.params.siteId, "sessions.manage"),
  async (req, res) => {
    const { siteId, sessionId } = req.params;

    const session = await prisma.session.findFirst({
      where: { id: sessionId, siteId },
    });

    if (!session) return res.status(404).json({ error: "Session not found" });

    await prisma.session.update({
      where: { id: sessionId },
      data: { status: "ENDED", endedAt: new Date() },
    });

    if (session.deviceId) {
      await prisma.device.update({
        where: { id: session.deviceId },
        data: { status: "LOCKED" },
      });
    }

    // ✅ REAL-TIME
    io.to(`site:${siteId}`).emit("session:update", {
      type: "ENDED",
      sessionId,
      deviceId: session.deviceId,
    });

    return res.json({ ok: true });
  }
);

/**
 * Lock device
 */
siteAdminRouter.post(
  "/sites/:siteId/devices/:deviceId/lock",
  requireUser,
  requireSitePermission((req) => req.params.siteId, "devices.manage"),
  async (req, res) => {
    const { siteId, deviceId } = req.params;

    await prisma.device.update({
      where: { id: deviceId },
      data: { status: "LOCKED" },
    });

    // ✅ REAL-TIME
    io.to(`site:${siteId}`).emit("device:update", {
      deviceId,
      status: "LOCKED",
    });

    return res.json({ ok: true });
  }
);

/**
 * Start maintenance
 */
siteAdminRouter.post(
  "/sites/:siteId/devices/:deviceId/maintenance/start",
  requireUser,
  requireSitePermission((req) => req.params.siteId, "devices.manage"),
  async (req, res) => {
    const { siteId, deviceId } = req.params;

    await prisma.device.update({
      where: { id: deviceId },
      data: { status: "MAINTENANCE" },
    });

    // ✅ REAL-TIME
    io.to(`site:${siteId}`).emit("device:update", {
      deviceId,
      status: "MAINTENANCE",
    });

    return res.json({ ok: true });
  }
);

/**
 * Stop maintenance
 */
siteAdminRouter.post(
  "/sites/:siteId/devices/:deviceId/maintenance/stop",
  requireUser,
  requireSitePermission((req) => req.params.siteId, "devices.manage"),
  async (req, res) => {
    const { siteId, deviceId } = req.params;

    await prisma.device.update({
      where: { id: deviceId },
      data: { status: "LOCKED" },
    });

    // ✅ REAL-TIME
    io.to(`site:${siteId}`).emit("device:update", {
      deviceId,
      status: "LOCKED",
    });

    return res.json({ ok: true });
  }
);

siteAdminRouter.get(
  "/sites/:siteId/announcements",
  requireUser,
  requireSitePermission((req) => req.params.siteId, "announcements.read"),
  async (req, res) => {
    const { siteId } = req.params;

    const announcements = await prisma.announcement.findMany({
      where: { siteId },
      orderBy: { createdAt: "desc" },
    });

    return res.json({
      ok: true,
      announcements,
    });
  }
);