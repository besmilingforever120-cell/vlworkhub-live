import { Router } from "express";
import { listNotifications } from "../controllers/notification-controller";
import { requireAuth } from "../middleware/auth";

export const notificationRouter = Router();

notificationRouter.use(requireAuth);
notificationRouter.get("/", listNotifications);
