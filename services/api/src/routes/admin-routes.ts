import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import {
  getEmailSettings,
  saveEmailSettings,
  sendTestEmail
} from "../controllers/email-settings-controller";

export const adminRouter = Router();

adminRouter.use(requireAuth);

adminRouter.get("/email-settings", getEmailSettings);
adminRouter.post("/email-settings", saveEmailSettings);
adminRouter.post("/test-email", sendTestEmail);
