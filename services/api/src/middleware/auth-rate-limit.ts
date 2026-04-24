import rateLimit from "express-rate-limit";
import { env } from "../config/env";

export const authLoginRateLimiter = rateLimit({
  windowMs: env.authRateLimitWindowMinutes * 60 * 1000,
  max: env.authRateLimitMaxAttempts,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: "Too many login attempts. Please try again later."
  }
});
