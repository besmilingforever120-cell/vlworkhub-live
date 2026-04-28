import crypto from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { getCookieName } from "@vlworkhub/auth";
import { env } from "../config/env";

const CSRF_COOKIE_NAME = "vlwh_csrf";
const CSRF_HEADER_NAME = "x-csrf-token";
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function getAllowedOrigins() {
  return new Set([...env.allowedOrigins, ...env.derivedAllowedOrigins]);
}

function parseOriginCandidate(value: string) {
  try {
    return new URL(value).origin;
  } catch {
    return "";
  }
}

function getRequestOrigin(req: Request) {
  const origin = String(req.headers.origin || "").trim();
  if (origin) {
    return parseOriginCandidate(origin);
  }

  const referer = String(req.headers.referer || "").trim();
  if (referer) {
    return parseOriginCandidate(referer);
  }

  return "";
}

function isCookieAuthRequest(req: Request) {
  return Boolean(req.cookies?.[getCookieName()]);
}

function ensureCsrfCookie(req: Request, res: Response) {
  const existing = String(req.cookies?.[CSRF_COOKIE_NAME] || "").trim();
  if (existing) {
    return existing;
  }

  const token = crypto.randomBytes(32).toString("hex");
  res.cookie(CSRF_COOKIE_NAME, token, {
    httpOnly: false,
    secure: env.nodeEnv === "production",
    sameSite: "lax",
    path: "/",
    domain: env.cookieDomain || undefined
  });
  return token;
}

export function csrfProtection(req: Request, res: Response, next: NextFunction) {
  ensureCsrfCookie(req, res);

  if (SAFE_METHODS.has(req.method.toUpperCase())) {
    return next();
  }

  if (!isCookieAuthRequest(req)) {
    return next();
  }

  const allowedOrigins = getAllowedOrigins();
  const requestOrigin = getRequestOrigin(req);
  if (requestOrigin && allowedOrigins.has(requestOrigin)) {
    return next();
  }

  const cookieToken = String(req.cookies?.[CSRF_COOKIE_NAME] || "").trim();
  const headerToken = String(req.headers[CSRF_HEADER_NAME] || "").trim();
  if (cookieToken && headerToken && cookieToken === headerToken) {
    return next();
  }

  return res.status(403).json({ message: "Invalid CSRF token" });
}
