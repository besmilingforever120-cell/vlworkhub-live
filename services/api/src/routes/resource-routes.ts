import { Router } from "express";
import { archiveTask, createResource, deleteResource, getResourceById, listArchivedTasks, listResources, updateResource } from "../controllers/resource-controller";
import { requireAuth } from "../middleware/auth";
import { processAnnouncementUploads } from "../middleware/announcement-upload";

export const resourceRouter = Router();

resourceRouter.use(requireAuth);
resourceRouter.post("/tasks/:id/archive", archiveTask);
resourceRouter.get("/tasks/archived", listArchivedTasks);
resourceRouter.get("/:resource/:id", getResourceById);
resourceRouter.get("/:resource", listResources);
resourceRouter.post("/:resource", processAnnouncementUploads, createResource);
resourceRouter.put("/:resource/:id", processAnnouncementUploads, updateResource);
resourceRouter.delete("/:resource/:id", deleteResource);
