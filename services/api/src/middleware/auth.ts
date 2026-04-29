import type { Request, Response, NextFunction } from "express";
import { getCookieName, verifyAuthToken } from "@vlworkhub/auth";
import { env } from "../config/env";
import { isTokenRevoked } from "../lib/token-revocation";

export interface AuthenticatedRequest extends Request {
  user?: ReturnType<typeof verifyAuthToken>;
}

export async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const bearer = req.headers.authorization?.replace("Bearer ", "");
  const token = bearer || req.cookies[getCookieName()];

  if (!token) {
    return res.status(401).json({ message: "Missing session token" });
  }

  try {
    const payload = verifyAuthToken(token, env.jwtSecret);
    if (!payload.jti) {
      return res.status(401).json({ message: "Invalid session token" });
    }

    const revoked = await isTokenRevoked(payload.jti);
    if (revoked) {
      return res.status(401).json({ message: "Invalid session token" });
    }

    req.user = payload;
    return next();
  } catch {
    return res.status(401).json({ message: "Invalid session token" });
  }
}
