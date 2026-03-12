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

async function withFallback<T>(resourceName: string, operation: () => Promise<T>, fallback: () => T) {
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
  const organizationId = String(req.user?.organization_id || "");

  if (!resource) {
    return res.status(404).json({ message: "Unknown resource" });
  }

  const items = await withFallback(
    resourceName,
    async () => {
      const result = await pool.query(`SELECT * FROM ${resource.table} WHERE organization_id = $1 ORDER BY id DESC LIMIT 100`, [organizationId]);
      return result.rows as Array<Record<string, string | number | null>>;
    },
    () => listDevResource(resourceName as never, organizationId) as Array<Record<string, string | number | null>>
  );

  return res.json({ items });
}

export async function createResource(req: AuthenticatedRequest, res: Response) {
  const resourceName = asParam(req.params.resource);
  const resource = resolveResource(resourceName);
  const organizationId = String(req.user?.organization_id || "");

  if (!resource) {
    return res.status(404).json({ message: "Unknown resource" });
  }

  const valueMap = Object.fromEntries(resource.fields.map((field) => [field, req.body[field] ?? null]));
  const values = resource.fields.map((field) => req.body[field] ?? null);
  const placeholders = resource.fields.map((_, index) => `$${index + 2}`).join(", ");

  const id = await withFallback(
    resourceName,
    async () => {
      const result = await pool.query(
        `INSERT INTO ${resource.table} (organization_id, ${resource.fields.join(", ")}) VALUES ($1, ${placeholders}) RETURNING id`,
        [organizationId, ...values]
      );
      return Number(result.rows[0].id);
    },
    () => createDevResource(resourceName as never, organizationId, valueMap).id
  );

  return res.status(201).json({ id });
}

export async function updateResource(req: AuthenticatedRequest, res: Response) {
  const resourceName = asParam(req.params.resource);
  const resource = resolveResource(resourceName);
  const organizationId = String(req.user?.organization_id || "");
  const recordId = Number(asParam(req.params.id));

  if (!resource) {
    return res.status(404).json({ message: "Unknown resource" });
  }

  const valueMap = Object.fromEntries(resource.fields.map((field) => [field, req.body[field] ?? null]));
  const assignments = resource.fields.map((field, index) => `${field} = $${index + 1}`).join(", ");
  const values = resource.fields.map((field) => req.body[field] ?? null);

  await withFallback(
    resourceName,
    async () => {
      await pool.query(
        `UPDATE ${resource.table} SET ${assignments} WHERE id = $${resource.fields.length + 1} AND organization_id = $${resource.fields.length + 2}`,
        [...values, recordId, organizationId]
      );
      return true;
    },
    () => Boolean(updateDevResource(resourceName as never, organizationId, recordId, valueMap))
  );

  return res.json({ success: true });
}

export async function deleteResource(req: AuthenticatedRequest, res: Response) {
  const resourceName = asParam(req.params.resource);
  const resource = resolveResource(resourceName);
  const organizationId = String(req.user?.organization_id || "");
  const recordId = Number(asParam(req.params.id));

  if (!resource) {
    return res.status(404).json({ message: "Unknown resource" });
  }

  await withFallback(
    resourceName,
    async () => {
      await pool.query(`DELETE FROM ${resource.table} WHERE id = $1 AND organization_id = $2`, [recordId, organizationId]);
      return true;
    },
    () => deleteDevResource(resourceName as never, organizationId, recordId)
  );

  return res.json({ success: true });
}
