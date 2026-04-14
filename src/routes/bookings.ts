import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";
import { generateNumericPin, addMinutes } from "../lib/pin";
import { sendPinEmail } from "../lib/email";

export const bookingsRouter = Router();

async function issueBookingPin(params: {
  bookingId: string;
  siteId: string;
  userId: string;
  deviceId?: string;
  validTo: Date;
  ipAddress?: string;
}) {
  const { bookingId, siteId, userId, deviceId, validTo, ipAddress } = params;

  const plainPin = generateNumericPin(6);
  const pinHash = await bcrypt.hash(plainPin, 10);

  const pin = await prisma.$transaction(async (tx) => {
    await tx.pin.updateMany({
      where: {
        bookingId,
        isActive: true,
      },
      data: {
        isActive: false,
      },
    });

    const createdPin = await tx.pin.create({
      data: {
        siteId,
        userId,
        deviceId,
        bookingId,
        scope: "BOOKING",
        pinHash,
        expiresAt: validTo,
        isActive: true,
      },
    });

    await tx.auditLog.create({
      data: {
        siteId,
        deviceId,
        actorId: userId,
        action: "BOOKING_PIN_ISSUED",
        details: {
          bookingId,
          pinId: createdPin.id,
          expiresAt: validTo.toISOString(),
        },
        ipAddress,
      },
    });

    return createdPin;
  });

  return {
    pin,
    plainPin,
  };
}

bookingsRouter.post("/", async (req, res) => {
  const schema = z.object({
    siteCode: z.string().min(1),
    email: z.string().email(),
    name: z.string().optional(),
    deviceId: z.string().optional(),
    source: z.string().default("DIRECT"),
    externalRef: z.string().optional(),
    validMinutes: z.number().int().positive().max(1440).default(120),
    sendEmail: z.boolean().default(true),
    includePinInResponse: z.boolean().default(false),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const {
    siteCode,
    email,
    name,
    deviceId,
    source,
    externalRef,
    validMinutes,
    sendEmail,
    includePinInResponse,
  } = parsed.data;

  const site = await prisma.site.findUnique({
    where: { siteCode },
  });

  if (!site || !site.isActive) {
    return res.status(404).json({ error: "Site not found or inactive" });
  }

  let device: { id: string; name: string } | null = null;

  if (deviceId) {
    const foundDevice = await prisma.device.findFirst({
      where: {
        id: deviceId,
        siteId: site.id,
      },
      select: {
        id: true,
        name: true,
      },
    });

    if (!foundDevice) {
      return res.status(404).json({ error: "Device not found for this site" });
    }

    device = foundDevice;
  }

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      fullName: name ?? undefined,
    },
    create: {
      email,
      fullName: name,
    },
  });

  const now = new Date();
  const validTo = addMinutes(now, validMinutes);

  const booking = await prisma.booking.create({
    data: {
      siteId: site.id,
      userId: user.id,
      deviceId,
      source,
      externalRef,
      email,
      name,
      status: "CONFIRMED",
      validFrom: now,
      validTo,
    },
  });

  await prisma.auditLog.create({
    data: {
      siteId: site.id,
      deviceId,
      actorId: user.id,
      action: "BOOKING_CREATED",
      details: {
        bookingId: booking.id,
        email,
        source,
        validTo: validTo.toISOString(),
      },
      ipAddress: req.ip,
    },
  });

  const { pin, plainPin } = await issueBookingPin({
    bookingId: booking.id,
    siteId: site.id,
    userId: user.id,
    deviceId,
    validTo,
    ipAddress: req.ip,
  });

  let emailSent = false;
  let emailError: string | null = null;

  if (sendEmail) {
    try {
      await sendPinEmail({
        to: email,
        siteName: site.name,
        pin: plainPin,
        expiresAt: validTo,
        deviceName: device?.name ?? null,
      });

      emailSent = true;

      await prisma.booking.update({
        where: { id: booking.id },
        data: {
          pinSentAt: new Date(),
        },
      });

      await prisma.auditLog.create({
        data: {
          siteId: site.id,
          deviceId,
          actorId: user.id,
          action: "PIN_EMAIL_SENT",
          details: {
            bookingId: booking.id,
            pinId: pin.id,
            email,
          },
          ipAddress: req.ip,
        },
      });
    } catch (error) {
      emailError = error instanceof Error ? error.message : "Unknown email error";

      await prisma.auditLog.create({
        data: {
          siteId: site.id,
          deviceId,
          actorId: user.id,
          action: "PIN_EMAIL_FAILED",
          details: {
            bookingId: booking.id,
            pinId: pin.id,
            email,
            error: emailError,
          },
          ipAddress: req.ip,
        },
      });
    }
  }

  return res.status(201).json({
    bookingId: booking.id,
    pinId: pin.id,
    email,
    expiresAt: validTo,
    emailSent,
    emailError,
    pin: includePinInResponse ? plainPin : undefined,
    message: emailSent
      ? "PIN generated and emailed successfully."
      : "PIN generated successfully.",
  });
});

bookingsRouter.post("/:bookingId/regenerate-pin", async (req, res) => {
  const schema = z.object({
    sendEmail: z.boolean().default(true),
    includePinInResponse: z.boolean().default(false),
    validMinutes: z.number().int().positive().max(1440).optional(),
    sendTo: z.string().email().optional(),
  });

  const parsed = schema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { bookingId } = req.params;
  const { sendEmail, includePinInResponse, validMinutes, sendTo } = parsed.data;

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      site: true,
      user: true,
      device: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  if (!booking) {
    return res.status(404).json({ error: "Booking not found" });
  }

  if (!booking.userId || !booking.user) {
    return res.status(400).json({ error: "Booking has no linked user" });
  }

  const newValidTo = validMinutes
    ? addMinutes(new Date(), validMinutes)
    : (booking.validTo ?? addMinutes(new Date(), 120));

  if (validMinutes) {
    await prisma.booking.update({
      where: { id: booking.id },
      data: {
        validTo: newValidTo,
      },
    });
  }

  const { pin, plainPin } = await issueBookingPin({
    bookingId: booking.id,
    siteId: booking.siteId,
    userId: booking.userId,
    deviceId: booking.deviceId ?? undefined,
    validTo: newValidTo,
    ipAddress: req.ip,
  });

  let emailSent = false;
  let emailError: string | null = null;
  const destinationEmail = sendTo ?? booking.email;

  if (sendEmail) {
    try {
      await sendPinEmail({
        to: destinationEmail,
        siteName: booking.site.name,
        pin: plainPin,
        expiresAt: newValidTo,
        deviceName: booking.device?.name ?? null,
      });

      emailSent = true;

      await prisma.booking.update({
        where: { id: booking.id },
        data: {
          pinSentAt: new Date(),
        },
      });

      await prisma.auditLog.create({
        data: {
          siteId: booking.siteId,
          deviceId: booking.deviceId ?? undefined,
          actorId: booking.userId,
          action: "PIN_REGENERATED_AND_SENT",
          details: {
            bookingId: booking.id,
            pinId: pin.id,
            email: destinationEmail,
          },
          ipAddress: req.ip,
        },
      });
    } catch (error) {
      emailError = error instanceof Error ? error.message : "Unknown email error";

      await prisma.auditLog.create({
        data: {
          siteId: booking.siteId,
          deviceId: booking.deviceId ?? undefined,
          actorId: booking.userId,
          action: "PIN_REGENERATE_EMAIL_FAILED",
          details: {
            bookingId: booking.id,
            pinId: pin.id,
            email: destinationEmail,
            error: emailError,
          },
          ipAddress: req.ip,
        },
      });
    }
  }

  return res.json({
    bookingId: booking.id,
    pinId: pin.id,
    email: destinationEmail,
    expiresAt: newValidTo,
    emailSent,
    emailError,
    pin: includePinInResponse ? plainPin : undefined,
    message: emailSent
      ? "New PIN generated and emailed successfully."
      : "New PIN generated successfully.",
  });
});