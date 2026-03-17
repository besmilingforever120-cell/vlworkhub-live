import { Router } from "express";
import { archiveTask, createResource, deleteResource, getResourceById, listResources, updateResource } from "../controllers/resource-controller";
import { requireAuth } from "../middleware/auth";

export const resourceRouter = Router();

resourceRouter.use(requireAuth);
resourceRouter.post("/tasks/:id/archive", archiveTask);
resourceRouter.get("/:resource/:id", getResourceById);
resourceRouter.get("/:resource", listResources);
resourceRouter.post("/:resource", createResource);
resourceRouter.put("/:resource/:id", updateResource);
resourceRouter.delete("/:resource/:id", deleteResource);
