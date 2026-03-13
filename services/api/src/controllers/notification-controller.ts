import type { Response } from "express";
import type { AuthenticatedRequest } from "../middleware/auth";
import { getUserNotifications } from "../services/notification-service";

export async function listNotifications(req: AuthenticatedRequest, res: Response) {
  if (!req.user?.user_id || !req.user.organization_id) {
    return res.status(401).json({ message: "Missing session context" });
  }

  const result = await getUserNotifications(String(req.user.user_id), String(req.user.organization_id));
  return res.json(result);
}
