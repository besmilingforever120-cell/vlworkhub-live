import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import multer, { type FileFilterCallback } from "multer";

const ALLOWED_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/jpg", "image/png"]);
const ALLOWED_IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png"]);

function ensureUploadSubdirectory(subdirectory: string) {
  const destination = path.resolve(__dirname, `../../uploads/${subdirectory}`);
  fs.mkdirSync(destination, { recursive: true });
  return destination;
}

function toSafeFileNamePrefix(originalName: string) {
  const baseName = path.basename(String(originalName || "file"), path.extname(String(originalName || "")));
  const safe = baseName
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  return safe || "file";
}

function assertAllowedImageFile(file: Express.Multer.File) {
  const normalizedMimeType = String(file.mimetype || "").toLowerCase();
  const extension = path.extname(String(file.originalname || "")).toLowerCase();

  if (!ALLOWED_IMAGE_MIME_TYPES.has(normalizedMimeType)) {
    return `Unsupported file type: ${normalizedMimeType || "unknown"}. Allowed types: image/jpeg, image/jpg, image/png`;
  }

  if (!ALLOWED_IMAGE_EXTENSIONS.has(extension)) {
    return `Unsupported file extension: ${extension || "missing"}. Allowed extensions: .jpg, .jpeg, .png`;
  }

  return null;
}

function createImageFileFilter() {
  return (req: Request, file: Express.Multer.File, callback: FileFilterCallback) => {
    const validationError = assertAllowedImageFile(file);
    if (validationError) {
      callback(new Error(validationError));
      return;
    }
    callback(null, true);
  };
}

function createImageUploadFor(subdirectory: "organizations" | "departments") {
  return multer({
    storage: multer.diskStorage({
      destination: (_req, _file, callback) => {
        callback(null, ensureUploadSubdirectory(subdirectory));
      },
      filename: (_req, file, callback) => {
        const extension = path.extname(String(file.originalname || "")).toLowerCase() || ".png";
        const prefix = toSafeFileNamePrefix(file.originalname);
        const suffix = crypto.randomBytes(8).toString("hex");
        callback(null, `${prefix}-${Date.now()}-${suffix}${extension}`);
      }
    }),
    fileFilter: createImageFileFilter(),
    limits: {
      files: 1,
      fileSize: 5 * 1024 * 1024
    }
  });
}

const organizationImageUpload = createImageUploadFor("organizations");
const departmentImageUpload = createImageUploadFor("departments");

type UploadExecutor = (req: Request, res: Response, callback: (error?: unknown) => void) => void;

function runUpload(uploadMiddleware: UploadExecutor) {
  return (req: Request, res: Response, next: NextFunction) => {
    uploadMiddleware(req, res, (error?: unknown) => {
      if (error) {
        const message = error instanceof Error ? error.message : "Invalid upload payload";
        res.status(400).json({ message });
        return;
      }
      next();
    });
  };
}

export const uploadOrganizationLogo = runUpload(organizationImageUpload.single("logo") as unknown as UploadExecutor);

export const uploadDepartmentImage = runUpload(
  departmentImageUpload.fields([
    { name: "image", maxCount: 1 },
    { name: "logo", maxCount: 1 }
  ]) as unknown as UploadExecutor
);
