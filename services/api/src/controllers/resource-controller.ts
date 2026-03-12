import type { ResultSetHeader, RowDataPacket } from "mysql2";
import type { Response } from "express";
import { pool } from "../config/db";
import type { AuthenticatedRequest } from "../middleware/auth";
import { resourceMap, type ResourceKey } from "../services/resource-config";

function asParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value || "";
}

function resolveResource(name: string) {
  return resourceMap[name as ResourceKey];
}

export async function listResources(req: AuthenticatedRequest, res: Response) {
  const resource = resolveResource(asParam(req.params.resource));
  if (!resource) {
    return res.status(404).json({ message: "Unknown resource" });
  }

  const [rows] = await pool.query<RowDataPacket[]>(`SELECT * FROM ${resource.table} WHERE organization_id = ? ORDER BY id DESC LIMIT 100`, [req.user?.organization_id]);
  return res.json({ items: rows });
}

export async function createResource(req: AuthenticatedRequest, res: Response) {
  const resource = resolveResource(asParam(req.params.resource));
  if (!resource) {
    return res.status(404).json({ message: "Unknown resource" });
  }

  const values = resource.fields.map((field) => req.body[field] ?? null);
  const placeholders = resource.fields.map(() => "?").join(", ");
  const [result] = await pool.query<ResultSetHeader>(`INSERT INTO ${resource.table} (organization_id, ${resource.fields.join(", ")}) VALUES (?, ${placeholders})`, [req.user?.organization_id, ...values]);
  return res.status(201).json({ id: result.insertId });
}

export async function updateResource(req: AuthenticatedRequest, res: Response) {
  const resource = resolveResource(asParam(req.params.resource));
  if (!resource) {
    return res.status(404).json({ message: "Unknown resource" });
  }

  const assignments = resource.fields.map((field) => `${field} = ?`).join(", ");
  const values = resource.fields.map((field) => req.body[field] ?? null);
  await pool.query(`UPDATE ${resource.table} SET ${assignments} WHERE id = ? AND organization_id = ?`, [...values, asParam(req.params.id), req.user?.organization_id]);
  return res.json({ success: true });
}

export async function deleteResource(req: AuthenticatedRequest, res: Response) {
  const resource = resolveResource(asParam(req.params.resource));
  if (!resource) {
    return res.status(404).json({ message: "Unknown resource" });
  }

  await pool.query(`DELETE FROM ${resource.table} WHERE id = ? AND organization_id = ?`, [asParam(req.params.id), req.user?.organization_id]);
  return res.json({ success: true });
}
