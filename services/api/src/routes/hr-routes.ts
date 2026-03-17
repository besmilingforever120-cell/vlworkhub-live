import { Router } from "express";
import {
  createHrAssignment,
  deleteHrAssignment,
  getHrDashboard,
  getMyHrRole,
  listHrAssignments,
  updateHrAssignment
} from "../controllers/hr-controller";
import { requireAuth } from "../middleware/auth";

export const hrRouter = Router();

hrRouter.use(requireAuth);
hrRouter.get("/my-role", getMyHrRole);
hrRouter.get("/dashboard", getHrDashboard);
hrRouter.get("/user-roles", listHrAssignments);
hrRouter.post("/user-roles", createHrAssignment);
hrRouter.get("/roles", listHrAssignments);
hrRouter.post("/roles", createHrAssignment);
hrRouter.put("/roles/:userId", updateHrAssignment);
hrRouter.delete("/roles/:userId", deleteHrAssignment);
