import { Router } from "express";
import { createResource, deleteResource, listResources, updateResource } from "../controllers/resource-controller";
import { requireAuth } from "../middleware/auth";

export const resourceRouter = Router();

resourceRouter.use(requireAuth);
resourceRouter.get("/:resource", listResources);
resourceRouter.post("/:resource", createResource);
resourceRouter.put("/:resource/:id", updateResource);
resourceRouter.delete("/:resource/:id", deleteResource);
