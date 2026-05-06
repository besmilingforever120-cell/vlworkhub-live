import { Router } from "express";
import {
  createAdminUser,
  createDepartment,
  createOrganization,
  deleteDepartment,
  getMyAppAccess,
  listAccessibleDepartments,
  listAdminUsers,
  listAssignableItAdmins,
  listDepartments,
  listOrganizations,
  listUsers,
  updateAdminUser,
  updateDepartment,
  updateOrganization,
  upsertUserAppAccess
} from "../controllers/user-controller";
import { requireAuth } from "../middleware/auth";
import { uploadDepartmentImage, uploadOrganizationLogo } from "../middleware/image-upload";

export const userRouter = Router();
export const adminUserRouter = Router();

userRouter.use(requireAuth);
userRouter.get("/users", listUsers);
userRouter.get("/departments", listAccessibleDepartments);
userRouter.get("/apps/my-access", getMyAppAccess);

adminUserRouter.use(requireAuth);
adminUserRouter.get("/users", listAdminUsers);
adminUserRouter.get("/it-admins", listAssignableItAdmins);
adminUserRouter.post("/users", createAdminUser);
adminUserRouter.put("/users/:id", updateAdminUser);
adminUserRouter.post("/user-access", upsertUserAppAccess);
adminUserRouter.get("/organizations", listOrganizations);
adminUserRouter.post("/organizations", uploadOrganizationLogo, createOrganization);
adminUserRouter.put("/organizations/:id", uploadOrganizationLogo, updateOrganization);
adminUserRouter.get("/departments", listDepartments);
adminUserRouter.post("/departments", uploadDepartmentImage, createDepartment);
adminUserRouter.put("/departments/:id", uploadDepartmentImage, updateDepartment);
adminUserRouter.delete("/departments/:id", deleteDepartment);
