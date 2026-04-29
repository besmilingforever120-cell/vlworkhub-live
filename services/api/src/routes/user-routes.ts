import { Router } from "express";
import {
  createAdminUser,
  createDepartment,
  createOrganization,
  deleteDepartment,
  getMyAppAccess,
  listAccessibleDepartments,
  listAdminUsers,
  listDepartments,
  listOrganizations,
  listUsers,
  updateAdminUser,
  updateDepartment,
  updateOrganization,
  upsertUserAppAccess
} from "../controllers/user-controller";
import { requireAuth } from "../middleware/auth";

export const userRouter = Router();
export const adminUserRouter = Router();

userRouter.use(requireAuth);
userRouter.get("/users", listUsers);
userRouter.get("/departments", listAccessibleDepartments);
userRouter.get("/apps/my-access", getMyAppAccess);

adminUserRouter.use(requireAuth);
adminUserRouter.get("/users", listAdminUsers);
adminUserRouter.post("/users", createAdminUser);
adminUserRouter.put("/users/:id", updateAdminUser);
adminUserRouter.post("/user-access", upsertUserAppAccess);
adminUserRouter.get("/organizations", listOrganizations);
adminUserRouter.post("/organizations", createOrganization);
adminUserRouter.put("/organizations/:id", updateOrganization);
adminUserRouter.get("/departments", listDepartments);
adminUserRouter.post("/departments", createDepartment);
adminUserRouter.put("/departments/:id", updateDepartment);
adminUserRouter.delete("/departments/:id", deleteDepartment);
