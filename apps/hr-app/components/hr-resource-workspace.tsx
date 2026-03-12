"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Pencil, Plus, Search, Trash2 } from "lucide-react";
import type { ResourceConfig } from "@vlworkhub/types";
import {
  createResource,
  deleteResource,
  getCurrentUser,
  getResource,
  type HrRecord,
  type HrResourceName,
  updateResource
} from "../lib/hr-client";
import { HrPortalHeader } from "./hr-portal-header";

function formatFieldLabel(field: string) {
  return field.replaceAll("_", " ").replace(/\b\w/g, (value) => value.toUpperCase());
}

export function HrResourceWorkspace({
  title,
  description,
  breadcrumb,
  resource,
  columns,
  fields,
  accentLabel
}: {
  title: string;
  description: string;
  breadcrumb: string;
  resource: HrResourceName;
  columns: ResourceConfig["columns"];
  fields: string[];
  accentLabel: string;
}) {
  const [rows, setRows] = useState<HrRecord[]>([]);
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<Record<string, string>>(
    Object.fromEntries(fields.map((field) => [field, ""]))
  );
  const [role, setRole] = useState("Employee");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    try {
      const [items, user] = await Promise.all([getResource(resource), getCurrentUser()]);
      setRows(items);
      setRole(user.role);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load records");
    }
  }

  useEffect(() => {
    void load();
  }, [resource]);

  const filteredRows = useMemo(() => {
    if (!search) return rows;
    return rows.filter((row) =>
      Object.values(row).some((value) =>
        String(value ?? "")
          .toLowerCase()
          .includes(search.toLowerCase())
      )
    );
  }, [rows, search]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");

    try {
      if (editingId) {
        await updateResource(resource, editingId, form);
      } else {
        await createResource(resource, form);
      }

      setEditingId(null);
      setForm(Object.fromEntries(fields.map((field) => [field, ""])));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save record");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: number) {
    setBusy(true);
    setError("");

    try {
      await deleteResource(resource, id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete record");
    } finally {
      setBusy(false);
    }
  }

  function startEdit(row: HrRecord) {
    setEditingId(Number(row.id));
    setForm(Object.fromEntries(fields.map((field) => [field, String(row[field] ?? "")])));
  }

  return (
    <div>
      <HrPortalHeader title={title} description={description} breadcrumb={breadcrumb} />

      <section className="mb-8 grid gap-4 lg:grid-cols-[1.2fr_0.8fr_0.8fr]">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
          <p className="text-sm text-slate-400">Records</p>
          <p className="mt-3 text-3xl font-semibold text-white">{rows.length}</p>
          <p className="mt-2 text-sm text-slate-300">{accentLabel}</p>
        </div>
        <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
          <p className="text-sm text-slate-400">Signed-in role</p>
          <p className="mt-3 text-3xl font-semibold text-white">{role}</p>
          <p className="mt-2 text-sm text-slate-300">Actions are protected by the shared session cookie.</p>
        </div>
        <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
          <p className="text-sm text-slate-400">Updated view</p>
          <div className="mt-3 flex items-center gap-3 text-cyan-300">
            <CalendarDays className="h-5 w-5" />
            <span className="text-sm">SPFx layout migrated to Next.js</span>
          </div>
        </div>
      </section>

      <section className="grid gap-8 xl:grid-cols-[1.35fr_0.65fr]">
        <div className="rounded-[2rem] border border-white/10 bg-slate-900/60 p-6">
          <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-white">{title}</h2>
              <p className="mt-2 text-sm text-slate-400">Search, review, and manage imported HR portal data.</p>
            </div>
            <div className="relative min-w-[260px]">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={`Search ${title.toLowerCase()}`}
                className="w-full rounded-2xl border border-white/10 bg-slate-950 px-11 py-3 text-sm text-white"
              />
            </div>
          </div>

          {error ? <p className="mb-4 text-sm text-rose-300">{error}</p> : null}

          <div className="overflow-hidden rounded-3xl border border-white/5">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-white/5 text-slate-400">
                <tr>
                  {columns.map((column) => (
                    <th key={column.key} className="px-4 py-4 font-medium">
                      {column.label}
                    </th>
                  ))}
                  <th className="px-4 py-4 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => (
                  <tr key={String(row.id)} className="border-t border-white/5">
                    {columns.map((column) => (
                      <td key={column.key} className="px-4 py-4 text-slate-200">
                        {String(row[column.key] ?? "-")}
                      </td>
                    ))}
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <button onClick={() => startEdit(row)} className="rounded-full bg-cyan-400/10 p-2 text-cyan-300">
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => void handleDelete(Number(row.id))}
                          className="rounded-full bg-rose-400/10 p-2 text-rose-300"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!filteredRows.length ? (
                  <tr>
                    <td colSpan={columns.length + 1} className="px-4 py-12 text-center text-slate-500">
                      No records match the current search.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-[2rem] border border-white/10 bg-slate-900/60 p-6">
          <div className="mb-5 flex items-center gap-3">
            <div className="rounded-2xl bg-cyan-400/10 p-3 text-cyan-300">
              <Plus className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-white">
                {editingId ? "Edit record" : "Create record"}
              </h2>
              <p className="mt-1 text-sm text-slate-400">Rebuilt from the legacy SharePoint HR forms.</p>
            </div>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            {fields.map((field) => (
              <div key={field}>
                <label className="mb-2 block text-sm text-slate-300">{formatFieldLabel(field)}</label>
                <input
                  value={form[field] || ""}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, [field]: event.target.value }))
                  }
                  className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-sm text-white"
                />
              </div>
            ))}
            <button
              disabled={busy}
              className="w-full rounded-2xl bg-cyan-400 px-4 py-3 font-medium text-slate-950 disabled:opacity-60"
            >
              {busy ? "Saving..." : editingId ? "Save changes" : "Create record"}
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}
