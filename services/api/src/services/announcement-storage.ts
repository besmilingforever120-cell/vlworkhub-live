import fs from "fs/promises";
import path from "path";
import crypto from "crypto";

/**
 * Service for managing announcement file uploads to Synology NAS.
 * Stores images and attachments in designated subdirectories with safe filename handling.
 */

function getAnnouncementsStoragePath(): string {
  const envPath = process.env.ANNOUNCEMENTS_STORAGE_PATH || "";
  if (envPath.trim()) {
    return envPath.trim();
  }

  return path.resolve(__dirname, "../../uploads/announcements");
}

function getImagesDirectory(): string {
  return path.join(getAnnouncementsStoragePath(), "Images");
}

function getAttachmentsDirectory(): string {
  return path.join(getAnnouncementsStoragePath(), "Attachments");
}

/**
 * Ensure subdirectories exist on Synology NAS
 */
export async function ensureAnnouncementDirectories(): Promise<void> {
  try {
    const imagesDir = getImagesDirectory();
    const attachmentsDir = getAttachmentsDirectory();

    await fs.mkdir(imagesDir, { recursive: true });
    await fs.mkdir(attachmentsDir, { recursive: true });
  } catch (error) {
    console.error("Failed to create announcement directories:", error);
    throw error;
  }
}

/**
 * Generate safe filename with collision prevention
 */
function generateSafeFilename(originalName: string): string {
  // Extract extension
  const ext = path.extname(originalName).toLowerCase();

  // Generate unique prefix with timestamp and random hash
  const timestamp = Date.now();
  const randomHash = crypto.randomBytes(6).toString("hex");

  // Sanitize original filename: keep only alphanumeric, dash, underscore
  const sanitized = path
    .basename(originalName, ext)
    .replace(/[^a-z0-9_-]/gi, "_")
    .slice(0, 50) // Limit length
    .replace(/_+/g, "_") // Collapse multiple underscores
    .replace(/^_+|_+$/g, ""); // Remove leading/trailing underscores

  // Construct final filename
  const fileName = `${sanitized || "file"}_${timestamp}_${randomHash}${ext}`;

  return fileName;
}

/**
 * Decode base64 data URL and extract file content + MIME type
 */
function decodeDataUrl(dataUrl: string): { buffer: Buffer; mimeType: string } | null {
  try {
    // Match data URL format: data:mimeType;base64,content
    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);

    if (!match) {
      console.warn("Invalid announcement data URL format");
      return null;
    }

    const [, mimeType, base64Content] = match;
    const buffer = Buffer.from(base64Content, "base64");

    return { buffer, mimeType };
  } catch (error) {
    console.error("Failed to decode announcement data URL:", error);
    return null;
  }
}

/**
 * Validate image MIME type
 */
function isValidImageType(mimeType: string): boolean {
  const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"];
  return allowedTypes.includes(mimeType.toLowerCase());
}

/**
 * Validate attachment MIME type (common document types)
 */
function isValidAttachmentType(mimeType: string): boolean {
  const allowedTypes = [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/plain",
    "text/csv"
  ];
  return allowedTypes.includes(mimeType.toLowerCase());
}

/**
 * Get file extension from MIME type
 */
function getExtensionFromMimeType(mimeType: string): string {
  const mimeToExt: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "application/pdf": ".pdf",
    "application/msword": ".doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
    "application/vnd.ms-excel": ".xls",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
    "text/plain": ".txt",
    "text/csv": ".csv"
  };

  return mimeToExt[mimeType.toLowerCase()] || ".bin";
}

/**
 * Save image from base64 data URL to Synology NAS
 */
export async function saveAnnouncementImage(
  dataUrl: string,
  originalFileName?: string
): Promise<{ fileUrl: string; fileName: string } | null> {
  try {
    const decoded = decodeDataUrl(dataUrl);

    if (!decoded) {
      console.warn("Could not decode announcement image data URL");
      return null;
    }

    const { buffer, mimeType } = decoded;

    if (!isValidImageType(mimeType)) {
      console.warn("Invalid announcement image type:", mimeType);
      return null;
    }

    await ensureAnnouncementDirectories();

    // Generate safe filename
    const baseFileName = originalFileName || "image";
    const ext = getExtensionFromMimeType(mimeType);
    const fileName = generateSafeFilename(`${baseFileName}${ext}`);

    // Write file to Synology NAS
    const imagesDir = getImagesDirectory();
    const filePath = path.join(imagesDir, fileName);

    await fs.writeFile(filePath, buffer);

    // Return relative URL for serving through /uploads route
    const fileUrl = `/uploads/announcements/Images/${encodeURIComponent(fileName)}`;

    return { fileUrl, fileName };
  } catch (error) {
    console.error("Failed to save announcement image:", error);
    return null;
  }
}

/**
 * Save attachment from base64 data URL to Synology NAS
 */
export async function saveAnnouncementAttachment(
  dataUrl: string,
  originalFileName: string
): Promise<{ fileUrl: string; fileName: string } | null> {
  try {
    const decoded = decodeDataUrl(dataUrl);

    if (!decoded) {
      console.warn("Could not decode announcement attachment data URL");
      return null;
    }

    const { buffer, mimeType } = decoded;

    if (!isValidAttachmentType(mimeType)) {
      console.warn("Invalid announcement attachment type:", mimeType);
      return null;
    }

    // Ensure directories exist
    await ensureAnnouncementDirectories();

    // Generate safe filename
    const fileName = generateSafeFilename(originalFileName);

    // Write file to Synology NAS
    const attachmentsDir = getAttachmentsDirectory();
    const filePath = path.join(attachmentsDir, fileName);

    await fs.writeFile(filePath, buffer);

    // Return relative URL for serving through /uploads route
    const fileUrl = `/uploads/announcements/Attachments/${encodeURIComponent(fileName)}`;

    return { fileUrl, fileName };
  } catch (error) {
    console.error("Failed to save announcement attachment:", error);
    return null;
  }
}

/**
 * Delete announcement image file
 */
export async function deleteAnnouncementImage(fileUrl: string): Promise<boolean> {
  try {
    if (!fileUrl || !fileUrl.includes("/uploads/announcements/Images/")) {
      return false;
    }

    const fileName = decodeURIComponent(fileUrl.split("/").pop() || "");
    const filePath = path.join(getImagesDirectory(), fileName);

    // Security: ensure path is within Images directory
    const resolvedPath = path.resolve(filePath);
    const resolvedDir = path.resolve(getImagesDirectory());

    if (!resolvedPath.startsWith(resolvedDir)) {
      console.warn("Announcement image path traversal attempt detected");
      return false;
    }

    await fs.unlink(resolvedPath);
    return true;
  } catch (error) {
    console.warn("Failed to delete announcement image:", error);
    return false;
  }
}

/**
 * Delete announcement attachment file
 */
export async function deleteAnnouncementAttachment(fileUrl: string): Promise<boolean> {
  try {
    if (!fileUrl || !fileUrl.includes("/uploads/announcements/Attachments/")) {
      return false;
    }

    const fileName = decodeURIComponent(fileUrl.split("/").pop() || "");
    const filePath = path.join(getAttachmentsDirectory(), fileName);

    // Security: ensure path is within Attachments directory
    const resolvedPath = path.resolve(filePath);
    const resolvedDir = path.resolve(getAttachmentsDirectory());

    if (!resolvedPath.startsWith(resolvedDir)) {
      console.warn("Announcement attachment path traversal attempt detected");
      return false;
    }

    await fs.unlink(resolvedPath);
    return true;
  } catch (error) {
    console.warn("Failed to delete announcement attachment:", error);
    return false;
  }
}

/**
 * Get storage info for debugging
 */
export async function getAnnouncementStorageInfo(): Promise<Record<string, unknown>> {
  return {
    storagePath: getAnnouncementsStoragePath(),
    imagesDirectory: getImagesDirectory(),
    attachmentsDirectory: getAttachmentsDirectory(),
    environment: {
      ANNOUNCEMENTS_STORAGE_PATH: process.env.ANNOUNCEMENTS_STORAGE_PATH || "(not set)"
    }
  };
}
