"use client";

import { useEffect, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { platformLinks } from "@vlworkhub/config";
import type { ResourceConfig } from "@vlworkhub/types";

type Row = Record<string, string | number | null>;

export function ResourcePage({ config }: { config: ResourceConfig }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [form, setForm] = useState<Record<string, string>>(Object.fromEntries(config.fields.map((field) => [field, ""])));
  const [editingId, setEditingId] = useState<number | null>(null);

  async function loadRows() {
    const response = await fetch(`${platformLinks.api}/resources/${config.resource}`, { credentials: "include" });
    if (response.ok) {
      const data = await response.json();
      setRows(data.items);
    }
  }

  useEffect(() => {
    void loadRows();
  }, [config.resource]);

  async function submitForm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const method = editingId ? "PUT" : "POST";
    const target = editingId
      ? `${platformLinks.api}/resources/${config.resource}/${editingId}`
      : `${platformLinks.api}/resources/${config.resource}`;

    const response = await fetch(target, {
      method,
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form)
    });

    if (response.ok) {
      setForm(Object.fromEntries(config.fields.map((field) => [field, ""])));
      setEditingId(null);
      await loadRows();
    }
  }

  async function deleteRow(id: number) {
    const response = await fetch(`${platformLinks.api}/resources/${config.resource}/${id}`, {
      method: "DELETE",
      credentials: "include"
    });

    if (response.ok) {
      await loadRows();
    }
  }

  function startEdit(row: Row) {
    setEditingId(Number(row.id));
    setForm(Object.fromEntries(config.fields.map((field) => [field, String(row[field] ?? "")])));
  }

  return (
    <div className="space-y-8">
      <section className="rounded-3xl border border-white/10 bg-white/5 p-6">
        <h2 className="text-2xl font-semibold">{config.title}</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">{config.description}</p>
      </section>
      <section className="grid gap-8 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-3xl border border-white/10 bg-slate-900/60 p-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-semibold">Records</h3>
            <span className="rounded-full bg-cyan-400/10 px-3 py-1 text-xs uppercase tracking-[0.2em] text-cyan-300">
              {rows.length} items
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-slate-400">
                <tr>
                  {config.columns.map((column) => (
                    <th key={column.key} className="border-b border-white/10 px-3 py-3 font-medium">{column.label}</th>
                  ))}
                  <th className="border-b border-white/10 px-3 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={String(row.id)} className="border-b border-white/5">
                    {config.columns.map((column) => (
                      <td key={column.key} className="px-3 py-4 text-slate-200">{String(row[column.key] ?? "-")}</td>
                    ))}
                    <td className="px-3 py-4">
                      <div className="flex items-center gap-3">
                        <button onClick={() => startEdit(row)} className="text-cyan-300"><Pencil className="h-4 w-4" /></button>
                        <button onClick={() => void deleteRow(Number(row.id))} className="text-rose-300"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="rounded-3xl border border-white/10 bg-slate-900/60 p-6">
          <div className="mb-4 flex items-center gap-3">
            <Plus className="h-5 w-5 text-cyan-300" />
            <h3 className="text-lg font-semibold">{editingId ? "Update record" : "Create record"}</h3>
          </div>
          <form onSubmit={submitForm} className="space-y-4">
            {config.fields.map((field) => (
              <div key={field}>
                <label className="mb-2 block text-sm capitalize text-slate-300">{field.replaceAll("_", " ")}</label>
                <input
                  value={form[field] || ""}
                  onChange={(event) => setForm((current) => ({ ...current, [field]: event.target.value }))}
                  className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-white"
                />
              </div>
            ))}
            <button className="w-full rounded-2xl bg-cyan-400 px-4 py-3 font-medium text-slate-950">
              {editingId ? "Save changes" : "Create"}
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}
