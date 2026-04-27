import { Router } from "express";
import { changePassword, login, logout, me, mobileLogin } from "../controllers/auth-controller";
import { authLoginRateLimiter } from "../middleware/auth-rate-limit.js";
import { requireAuth } from "../middleware/auth";

export const authRouter = Router();

authRouter.post("/login", authLoginRateLimiter, login);
authRouter.post("/mobile-login", authLoginRateLimiter, mobileLogin);
authRouter.post("/change-password", requireAuth, changePassword);
authRouter.post("/logout", logout);
authRouter.get("/me", requireAuth, me);
