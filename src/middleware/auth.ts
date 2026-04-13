import type { Request, Response, NextFunction } from "express";

export function requireHQ(req: Request, res: Response, next: NextFunction) {
  const key = req.header("x-hq-api-key");
  if (!key || key !== process.env.HQ_API_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}