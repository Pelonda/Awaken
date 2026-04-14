import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { io } from "../server";

export const sessionsRouter = Router();

sessionsRouter.post("/start", async (req, res) => {
  const schema = z.object({
    siteCode: z.string().min(1),
    pin: z.string().regex(/^\d{4,8}$/),
    deviceId: z.string().min(1),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { siteCode, pin, deviceId } = parsed.data;

  const site = await prisma.site.findUnique({
    where: { siteCode },
  });

  if (!site) {
    return res.status(404).json({ error: "Site not found" });
  }

  const device = await prisma.device.findFirst({
    where: {
      id: deviceId,
      siteId: site.id,
    },
  });

  if (!device) {
    return res.status(404).json({ error: "Device not found for this site" });
  }

  if (device.status === "MAINTENANCE") {
    return res.status(409).json({ error: "Device is in maintenance mode" });
  }

  const activeSession = await prisma.session.findFirst({
    where: {
      deviceId,
      status: "ACTIVE",
    },
  });

  if (activeSession) {
    return res.status(409).json({ error: "Device already has an active session" });
  }

  const pins = await prisma.pin.findMany({
    where: {
      siteId: site.id,
      deviceId,
      isActive: true,
      expiresAt: {
        gt: new Date(),
      },
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 20,
  });

  const bcrypt = await import("bcryptjs");

  let matchedPin: (typeof pins)[number] | null = null;

  for (const candidate of pins) {
    const ok = await bcrypt.default.compare(pin, candidate.pinHash);
    if (ok) {
      matchedPin = candidate;
      break;
    }
  }

  if (!matchedPin) {
    await prisma.auditLog.create({
      data: {
        siteId: site.id,
        deviceId,
        action: "SESSION_START_FAILED_BAD_PIN",
        details: {
          reason: "Invalid or expired PIN",
        },
        ipAddress: req.ip,
      },
    });

    return res.status(401).json({ error: "Invalid or expired PIN" });
  }

  const session = await prisma.$transaction(async (tx) => {
    const created = await tx.session.create({
      data: {
        siteId: site.id,
        deviceId,
        userId: matchedPin!.userId ?? undefined,
        pinId: matchedPin!.id,
        status: "ACTIVE",
      },
    });

    await tx.device.update({
      where: { id: deviceId },
      data: {
        status: "IN_USE",
        lastSeenAt: new Date(),
      },
    });

    await tx.auditLog.create({
      data: {
        siteId: site.id,
        deviceId,
        actorId: matchedPin!.userId ?? undefined,
        action: "SESSION_STARTED",
        details: {
          sessionId: created.id,
          pinId: matchedPin!.id,
          bookingId: matchedPin!.bookingId,
        },
        ipAddress: req.ip,
      },
    });

    return created;
  });

  // ✅ REAL-TIME EVENT (SESSION START)
  io.to(`site:${site.id}`).emit("session:update", {
    type: "STARTED",
    sessionId: session.id,
    deviceId,
  });

  return res.status(201).json({
    ok: true,
    sessionId: session.id,
    deviceId,
    userId: session.userId,
    startedAt: session.startedAt,
    status: session.status,
  });
});

sessionsRouter.post("/:sessionId/end", async (req, res) => {
  const schema = z.object({
    reason: z.string().optional(),
  });

  const parsed = schema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { sessionId } = req.params;
  const { reason } = parsed.data;

  const existing = await prisma.session.findUnique({
    where: { id: sessionId },
  });

  if (!existing) {
    return res.status(404).json({ error: "Session not found" });
  }

  if (existing.status !== "ACTIVE") {
    return res.status(400).json({ error: "Session is not active" });
  }

  const ended = await prisma.$transaction(async (tx) => {
    const updated = await tx.session.update({
      where: { id: sessionId },
      data: {
        status: "ENDED",
        endedAt: new Date(),
      },
    });

    if (existing.deviceId) {
      await tx.device.update({
        where: { id: existing.deviceId },
        data: {
          status: "LOCKED",
          lastSeenAt: new Date(),
        },
      });
    }

    await tx.auditLog.create({
      data: {
        siteId: existing.siteId,
        deviceId: existing.deviceId ?? undefined,
        actorId: existing.userId ?? undefined,
        action: "SESSION_ENDED",
        details: {
          sessionId,
          reason: reason ?? "manual",
        },
        ipAddress: req.ip,
      },
    });

    return updated;
  });

  // ✅ REAL-TIME EVENT (SESSION END)
  io.to(`site:${existing.siteId}`).emit("session:update", {
    type: "ENDED",
    sessionId,
    deviceId: existing.deviceId,
  });

  return res.json({
    ok: true,
    sessionId: ended.id,
    status: ended.status,
    endedAt: ended.endedAt,
  });
});

sessionsRouter.get("/device/:deviceId/active", async (req, res) => {
  const { deviceId } = req.params;

  const session = await prisma.session.findFirst({
    where: {
      deviceId,
      status: "ACTIVE",
    },
    orderBy: {
      startedAt: "desc",
    },
  });

  if (!session) {
    return res.json({
      ok: true,
      active: false,
    });
  }

  return res.json({
    ok: true,
    active: true,
    session,
  });
});