import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireHQ } from "../middleware/auth";

export const clientRouter = Router();

clientRouter.get("/devices/:deviceId/state", async (req, res) => {
  const { deviceId } = req.params;

  const device = await prisma.device.findUnique({
    where: { id: deviceId },
    include: {
      sessions: {
        where: { status: "ACTIVE" },
        orderBy: { startedAt: "desc" },
        take: 1,
      },
      site: {
        select: {
          id: true,
          name: true,
          slug: true,
          defaultMode: true,
        },
      },
    },
  });

  if (!device) {
    return res.status(404).json({ error: "Device not found" });
  }

  const activeSession = device.sessions[0] ?? null;

  return res.json({
    ok: true,
    device: {
      id: device.id,
      name: device.name,
      hostname: device.hostname,
      status: device.status,
      mode: device.mode,
      isRegistered: device.isRegistered,
      lastSeenAt: device.lastSeenAt,
      clientVersion: device.clientVersion,
    },
    site: device.site,
    session: activeSession,
    lockState:
      device.status === "MAINTENANCE"
        ? "MAINTENANCE"
        : activeSession
          ? "UNLOCKED"
          : "LOCKED",
  });
});

clientRouter.get("/devices/:deviceId/announcements", async (req, res) => {
  const { deviceId } = req.params;

  const device = await prisma.device.findUnique({
    where: { id: deviceId },
    select: {
      id: true,
      siteId: true
    }
  });

  if (!device) {
    return res.status(404).json({ error: "Device not found" });
  }

  const deliveries = await prisma.announcementDelivery.findMany({
    where: {
      deviceId,
      acknowledgedAt: null,
      announcement: {
        isActive: true,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } }
        ]
      }
    },
    include: {
      announcement: true
    },
    orderBy: {
      createdAt: "asc"
    }
  });

  return res.json({
    ok: true,
    announcements: deliveries.map((d) => ({
      deliveryId: d.id,
      announcementId: d.announcementId,
      title: d.announcement.title,
      message: d.announcement.message,
      level: d.announcement.level,
      targetType: d.announcement.targetType,
      createdAt: d.announcement.createdAt,
      expiresAt: d.announcement.expiresAt
    }))
  });
});

clientRouter.post("/devices/:deviceId/announcements/:deliveryId/ack", async (req, res) => {
  const { deviceId, deliveryId } = req.params;

  const delivery = await prisma.announcementDelivery.findFirst({
    where: {
      id: deliveryId,
      deviceId
    },
    include: {
      announcement: true
    }
  });

  if (!delivery) {
    return res.status(404).json({ error: "Announcement delivery not found" });
  }

  if (delivery.acknowledgedAt) {
    return res.json({
      ok: true,
      deliveryId,
      alreadyAcknowledged: true
    });
  }

  await prisma.announcementDelivery.update({
    where: { id: deliveryId },
    data: {
      deliveredAt: delivery.deliveredAt ?? new Date(),
      acknowledgedAt: new Date()
    }
  });

  await prisma.auditLog.create({
    data: {
      siteId: delivery.announcement.siteId,
      deviceId,
      action: "ANNOUNCEMENT_ACKNOWLEDGED",
      details: {
        deliveryId,
        announcementId: delivery.announcementId
      },
      ipAddress: req.ip
    }
  });

  return res.json({
    ok: true,
    deliveryId,
    acknowledged: true
  });
});

clientRouter.post("/devices/:deviceId/maintenance/start", requireHQ, async (req, res) => {
  const { deviceId } = req.params;

  const device = await prisma.device.findUnique({
    where: { id: deviceId },
  });

  if (!device) {
    return res.status(404).json({ error: "Device not found" });
  }

  const activeSession = await prisma.session.findFirst({
    where: {
      deviceId,
      status: "ACTIVE",
    },
    orderBy: {
      startedAt: "desc",
    },
  });

  await prisma.$transaction(async (tx) => {
    if (activeSession) {
      await tx.session.update({
        where: { id: activeSession.id },
        data: {
          status: "ENDED",
          endedAt: new Date(),
        },
      });

      await tx.auditLog.create({
        data: {
          siteId: device.siteId,
          deviceId: device.id,
          actorId: null,
          action: "SESSION_ENDED_BY_MAINTENANCE",
          details: {
            sessionId: activeSession.id,
          },
          ipAddress: req.ip,
        },
      });
    }

    await tx.device.update({
      where: { id: deviceId },
      data: {
        status: "MAINTENANCE",
        lastSeenAt: new Date(),
      },
    });

    await tx.auditLog.create({
      data: {
        siteId: device.siteId,
        deviceId: device.id,
        actorId: null,
        action: "DEVICE_MAINTENANCE_STARTED",
        details: {
          previousSessionId: activeSession?.id ?? null,
        },
        ipAddress: req.ip,
      },
    });
  });

  return res.json({
    ok: true,
    deviceId,
    status: "MAINTENANCE",
    message: "Device is now in maintenance mode.",
  });
});

clientRouter.post("/devices/:deviceId/maintenance/stop", requireHQ, async (req, res) => {
  const { deviceId } = req.params;

  const device = await prisma.device.findUnique({
    where: { id: deviceId },
  });

  if (!device) {
    return res.status(404).json({ error: "Device not found" });
  }

  await prisma.device.update({
    where: { id: deviceId },
    data: {
      status: "LOCKED",
      lastSeenAt: new Date(),
    },
  });

  await prisma.auditLog.create({
    data: {
      siteId: device.siteId,
      deviceId: device.id,
      actorId: null,
      action: "DEVICE_MAINTENANCE_STOPPED",
      details: {},
      ipAddress: req.ip,
    },
  });

  return res.json({
    ok: true,
    deviceId,
    status: "LOCKED",
    message: "Device returned to locked mode.",
  });
});

clientRouter.post("/devices/:deviceId/lock", requireHQ, async (req, res) => {
  const { deviceId } = req.params;

  const device = await prisma.device.findUnique({
    where: { id: deviceId },
  });

  if (!device) {
    return res.status(404).json({ error: "Device not found" });
  }

  const activeSession = await prisma.session.findFirst({
    where: {
      deviceId,
      status: "ACTIVE",
    },
  });

  await prisma.$transaction(async (tx) => {
    if (activeSession) {
      await tx.session.update({
        where: { id: activeSession.id },
        data: {
          status: "ENDED",
          endedAt: new Date(),
        },
      });

      await tx.auditLog.create({
        data: {
          siteId: device.siteId,
          deviceId: device.id,
          actorId: null,
          action: "SESSION_FORCE_ENDED_BY_LOCK",
          details: {
            sessionId: activeSession.id,
          },
          ipAddress: req.ip,
        },
      });
    }

    await tx.device.update({
      where: { id: deviceId },
      data: {
        status: "LOCKED",
        lastSeenAt: new Date(),
      },
    });

    await tx.auditLog.create({
      data: {
        siteId: device.siteId,
        deviceId: device.id,
        actorId: null,
        action: "DEVICE_LOCKED_BY_ADMIN",
        details: {},
        ipAddress: req.ip,
      },
    });
  });

  return res.json({
    ok: true,
    deviceId,
    status: "LOCKED",
    message: "Device locked successfully.",
  });
});