import type { Request, Response, NextFunction } from "express";
import { getCookieName, verifyAuthToken } from "@vlworkhub/auth";
import { env } from "../config/env";

export interface AuthenticatedRequest extends Request {
  user?: ReturnType<typeof verifyAuthToken>;
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const bearer = req.headers.authorization?.replace("Bearer ", "");
  const token = bearer || req.cookies[getCookieName()];

  if (!token) {
    return res.status(401).json({ message: "Missing session token" });
  }

  try {
    req.user = verifyAuthToken(token, env.jwtSecret);
    return next();
  } catch {
    return res.status(401).json({ message: "Invalid session token" });
  }
}
