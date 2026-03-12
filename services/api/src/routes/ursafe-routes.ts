import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import {
  clearActiveSession,
  createCheckIn,
  createEmergency,
  createShift,
  createTrip,
  deleteTrip,
  getTrip,
  listActiveSessions,
  listCheckIns,
  listEmergencies,
  listShifts,
  listTrips,
  listUsers,
  resolveEmergency,
  updateShift,
  updateTrip
} from "../controllers/ursafe-controller";

export const ursafeRouter = Router();

ursafeRouter.use(requireAuth);
ursafeRouter.get("/users", listUsers);
ursafeRouter.get("/trips", listTrips);
ursafeRouter.get("/trips/:id", getTrip);
ursafeRouter.post("/trips", createTrip);
ursafeRouter.put("/trips/:id", updateTrip);
ursafeRouter.delete("/trips/:id", deleteTrip);
ursafeRouter.get("/shifts", listShifts);
ursafeRouter.post("/shifts", createShift);
ursafeRouter.put("/shifts/:id", updateShift);
ursafeRouter.get("/check-ins", listCheckIns);
ursafeRouter.post("/check-ins", createCheckIn);
ursafeRouter.get("/emergencies", listEmergencies);
ursafeRouter.post("/emergencies", createEmergency);
ursafeRouter.put("/emergencies/:id", resolveEmergency);
ursafeRouter.get("/active-sessions", listActiveSessions);
ursafeRouter.delete("/active-sessions/user/:userId", clearActiveSession);
