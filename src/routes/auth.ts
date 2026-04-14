import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";
import { signAccessToken } from "../lib/jwt";

export const authRouter = Router();

authRouter.post("/register", async (req, res) => {
  const schema = z.object({
    email: z.string().email(),
    fullName: z.string().min(1).max(120),
    password: z.string().min(6).max(200),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { email, fullName, password } = parsed.data;

  const existing = await prisma.user.findUnique({
    where: { email },
  });

  if (existing?.passwordHash) {
    return res.status(409).json({ error: "User already registered" });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      fullName,
      passwordHash,
      isActive: true,
    },
    create: {
      email,
      fullName,
      passwordHash,
      isActive: true,
    },
  });

  const token = signAccessToken({
    sub: user.id,
    email: user.email,
  });

  return res.status(201).json({
    ok: true,
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
    },
    accessToken: token,
  });
});

authRouter.post("/login", async (req, res) => {
  const schema = z.object({
    email: z.string().email(),
    password: z.string().min(1),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user || !user.isActive || !user.passwordHash) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const ok = await bcrypt.compare(password, user.passwordHash);

  if (!ok) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const token = signAccessToken({
    sub: user.id,
    email: user.email,
  });

  return res.json({
    ok: true,
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
    },
    accessToken: token,
  });
});

authRouter.get("/me", async (req, res) => {
  return res.status(501).json({ error: "Use protected route after middleware update" });
});