import type { Request, Response, NextFunction } from "express";
import { prisma } from "../lib/prisma";
import { hasPermission, type SitePermission } from "../lib/permissions";
import { verifyAccessToken } from "../lib/jwt";

declare global {
  namespace Express {
    interface Request {
      awakenUser?: {
        id: string;
        email: string;
      };
      siteMembership?: {
        id: string;
        siteId: string;
        userId: string;
        role: string;
      };
      targetSiteId?: string;
    }
  }
}

export function requireHQ(req: Request, res: Response, next: NextFunction) {
  const key = req.header("x-hq-api-key");
  if (!key || key !== process.env.HQ_API_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

export async function requireUser(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.header("authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing Bearer token" });
  }

  const token = authHeader.slice("Bearer ".length).trim();

  try {
    const payload = verifyAccessToken(token);

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        isActive: true,
      },
    });

    if (!user || !user.isActive) {
      return res.status(401).json({ error: "User not found or inactive" });
    }

    req.awakenUser = {
      id: user.id,
      email: user.email,
    };

    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}

export function requireSitePermission(
  getSiteId: (req: Request) => string | undefined,
  permission: SitePermission
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const siteId = getSiteId(req);

    if (!siteId) {
      return res.status(400).json({ error: "Site ID not provided" });
    }

    if (!req.awakenUser) {
      return res.status(401).json({ error: "User authentication required" });
    }

    const membership = await prisma.siteMember.findFirst({
      where: {
        siteId,
        userId: req.awakenUser.id,
      },
      select: {
        id: true,
        siteId: true,
        userId: true,
        role: true,
      },
    });

    if (!membership) {
      return res.status(403).json({ error: "Not a member of this site" });
    }

    if (!hasPermission(membership.role, permission)) {
      return res.status(403).json({
        error: "Insufficient permission",
        required: permission,
        role: membership.role,
      });
    }

    req.siteMembership = membership;
    next();
  };
}