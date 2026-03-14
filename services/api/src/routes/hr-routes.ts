import { Router } from "express";
import { getHrDashboard, getMyHrRole, listHrAssignments, saveHrAssignment } from "../controllers/hr-controller";
import { requireAuth } from "../middleware/auth";

export const hrRouter = Router();

hrRouter.use(requireAuth);
hrRouter.get("/my-role", getMyHrRole);
hrRouter.get("/dashboard", getHrDashboard);
hrRouter.get("/user-roles", listHrAssignments);
hrRouter.post("/user-roles", saveHrAssignment);
