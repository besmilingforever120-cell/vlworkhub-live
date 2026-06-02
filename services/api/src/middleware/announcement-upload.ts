import type { Response, NextFunction } from "express";
import type { AuthenticatedRequest } from "./auth";
import {
  saveAnnouncementImage,
  saveAnnouncementAttachment,
  ensureAnnouncementDirectories,
  deleteAnnouncementImage,
  deleteAnnouncementAttachment
} from "../services/announcement-storage";
import { pool } from "../config/db";

/**
 * Middleware to process announcement image and attachment uploads from data URLs.
 * Converts base64 data URLs to files stored on Synology NAS.
 * On updates, replaces old files with new ones.
 */
export async function processAnnouncementUploads(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    // Only process announcements resource
    const resource = String(req.params.resource || "").toLowerCase();
    if (resource !== "announcements") {
      return next();
    }

    // Only process POST and PUT requests
    if (!["POST", "PUT"].includes(req.method)) {
      return next();
    }

    // Ensure storage directories exist
    await ensureAnnouncementDirectories();

    const body = req.body as Record<string, unknown>;

    // Process event image
    if (body.event_image_url && typeof body.event_image_url === "string") {
      const imageUrl = body.event_image_url.trim();
      const isDataUrl = imageUrl.startsWith("data:");

      if (isDataUrl) {
        const result = await saveAnnouncementImage(imageUrl, "event-image");

        if (result) {
          body.event_image_url = result.fileUrl;
        } else {
          body.event_image_url = null;
        }
      }
    } else if (!body.event_image_url || body.event_image_url === "") {
      body.event_image_url = null;
    }

    // Process attachment
    if (body.attachment_url && typeof body.attachment_url === "string") {
      const attachmentUrl = body.attachment_url.trim();
      const attachmentName = String(body.attachment_name || "attachment").trim();
      const isDataUrl = attachmentUrl.startsWith("data:");

      if (isDataUrl) {
        const result = await saveAnnouncementAttachment(attachmentUrl, attachmentName);

        if (result) {
          body.attachment_url = result.fileUrl;
          body.attachment_name = result.fileName;
        } else {
          body.attachment_url = null;
          body.attachment_name = null;
        }
      }
    } else if (!body.attachment_url || body.attachment_url === "") {
      body.attachment_url = null;
      body.attachment_name = null;
    }

    return next();
  } catch (error) {
    console.error("Announcement upload middleware error:", error);
    // Continue processing even if upload processing fails
    // This prevents breaking the entire request flow
    return next();
  }
}
