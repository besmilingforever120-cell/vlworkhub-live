import type { ResultSetHeader, RowDataPacket } from "mysql2";
import type { Response } from "express";
import { pool } from "../config/db";
import type { AuthenticatedRequest } from "../middleware/auth";
import { resourceMap, type ResourceKey } from "../services/resource-config";
import {
  createDevResource,
  deleteDevResource,
  listDevResource,
  shouldUseDevStore,
  updateDevResource
} from "../services/dev-store";

function asParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value || "";
}

function resolveResource(name: string) {
  return resourceMap[name as ResourceKey];
}

async function withFallback<T>(resourceName: string, organizationId: number, operation: () => Promise<T>, fallback: () => T) {
  try {
    return await operation();
  } catch (error) {
    if (shouldUseDevStore()) {
      console.warn(`Database unavailable for ${resourceName}; using development store.`, error);
      return fallback();
    }

    throw error;
  }
}

export async function listResources(req: AuthenticatedRequest, res: Response) {
  const resourceName = asParam(req.params.resource);
  const resource = resolveResource(resourceName);
  const organizationId = Number(req.user?.organization_id || 0);

  if (!resource) {
    return res.status(404).json({ message: "Unknown resource" });
  }

  const items = await withFallback(
    resourceName,
    organizationId,
    async () => {
      const [rows] = await pool.query<RowDataPacket[]>(`SELECT * FROM ${resource.table} WHERE organization_id = ? ORDER BY id DESC LIMIT 100`, [organizationId]);
      return rows;
    },
    () => listDevResource(resourceName as any, organizationId)
  );

  return res.json({ items });
}

export async function createResource(req: AuthenticatedRequest, res: Response) {
  const resourceName = asParam(req.params.resource);
  const resource = resolveResource(resourceName);
  const organizationId = Number(req.user?.organization_id || 0);

  if (!resource) {
    return res.status(404).json({ message: "Unknown resource" });
  }

  const valueMap = Object.fromEntries(resource.fields.map((field) => [field, req.body[field] ?? null]));
  const values = resource.fields.map((field) => req.body[field] ?? null);
  const placeholders = resource.fields.map(() => "?").join(", ");

  const id = await withFallback(
    resourceName,
    organizationId,
    async () => {
      const [result] = await pool.query<ResultSetHeader>(`INSERT INTO ${resource.table} (organization_id, ${resource.fields.join(", ")}) VALUES (?, ${placeholders})`, [organizationId, ...values]);
      return result.insertId;
    },
    () => createDevResource(resourceName as any, organizationId, valueMap).id
  );

  return res.status(201).json({ id });
}

export async function updateResource(req: AuthenticatedRequest, res: Response) {
  const resourceName = asParam(req.params.resource);
  const resource = resolveResource(resourceName);
  const organizationId = Number(req.user?.organization_id || 0);
  const recordId = Number(asParam(req.params.id));

  if (!resource) {
    return res.status(404).json({ message: "Unknown resource" });
  }

  const valueMap = Object.fromEntries(resource.fields.map((field) => [field, req.body[field] ?? null]));
  const assignments = resource.fields.map((field) => `${field} = ?`).join(", ");
  const values = resource.fields.map((field) => req.body[field] ?? null);

  await withFallback(
    resourceName,
    organizationId,
    async () => {
      await pool.query(`UPDATE ${resource.table} SET ${assignments} WHERE id = ? AND organization_id = ?`, [...values, recordId, organizationId]);
      return true;
    },
    () => updateDevResource(resourceName as any, organizationId, recordId, valueMap)
  );

  return res.json({ success: true });
}

export async function deleteResource(req: AuthenticatedRequest, res: Response) {
  const resourceName = asParam(req.params.resource);
  const resource = resolveResource(resourceName);
  const organizationId = Number(req.user?.organization_id || 0);
  const recordId = Number(asParam(req.params.id));

  if (!resource) {
    return res.status(404).json({ message: "Unknown resource" });
  }

  await withFallback(
    resourceName,
    organizationId,
    async () => {
      await pool.query(`DELETE FROM ${resource.table} WHERE id = ? AND organization_id = ?`, [recordId, organizationId]);
      return true;
    },
    () => deleteDevResource(resourceName as any, organizationId, recordId)
  );

  return res.json({ success: true });
}
