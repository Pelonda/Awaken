import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";

export const pinsRouter = Router();

pinsRouter.post("/verify", async (req, res) => {
  const schema = z.object({
    siteCode: z.string().min(1),
    pin: z.string().regex(/^\d{4,8}$/),
    deviceId: z.string().optional()
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { siteCode, pin, deviceId } = parsed.data;

  const site = await prisma.site.findUnique({
    where: { siteCode }
  });

  if (!site) {
    return res.status(404).json({ error: "Site not found" });
  }

  const candidates = await prisma.pin.findMany({
    where: {
      siteId: site.id,
      isActive: true,
      expiresAt: {
        gt: new Date()
      },
      ...(deviceId ? { deviceId } : {})
    },
    orderBy: {
      createdAt: "desc"
    },
    take: 20
  });

  for (const candidate of candidates) {
    const ok = await bcrypt.compare(pin, candidate.pinHash);
    if (ok) {
      await prisma.auditLog.create({
        data: {
          siteId: site.id,
          deviceId: candidate.deviceId ?? undefined,
          actorId: candidate.userId ?? undefined,
          action: "PIN_VERIFIED",
          details: {
            pinId: candidate.id,
            bookingId: candidate.bookingId
          },
          ipAddress: req.ip
        }
      });

      return res.json({
        ok: true,
        pinId: candidate.id,
        bookingId: candidate.bookingId,
        userId: candidate.userId,
        deviceId: candidate.deviceId,
        expiresAt: candidate.expiresAt
      });
    }
  }

  await prisma.auditLog.create({
    data: {
      siteId: site.id,
      action: "PIN_VERIFY_FAILED",
      details: {
        deviceId
      },
      ipAddress: req.ip
    }
  });

  return res.status(401).json({
    ok: false,
    error: "Invalid or expired PIN"
  });
});