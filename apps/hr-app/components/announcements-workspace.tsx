"use client";

import { useEffect, useMemo, useState } from "react";
import { Edit3, Megaphone, Plus, Search, Trash2 } from "lucide-react";
import { createResource, deleteResource, getApiErrorMessage, getResource, type HrRecord, updateResource } from "../lib/hr-client";
import { HrPortalHeader } from "./hr-portal-header";

const priorities = ["All", "Highly Important", "Important", "Normal"];

export function AnnouncementsWorkspace() {
  const emptyForm = {
    title: "",
    body: "",
    audience: "All Staff",
    publish_date: "",
    start_date: "",
    end_date: "",
    priority: "Normal",
    status: "Draft"
  };

  const [items, setItems] = useState<HrRecord[]>([]);
  const [query, setQuery] = useState("");
  const [priority, setPriority] = useState("All");
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [error, setError] = useState("");

  async function load() {
    try {
      setItems(await getResource("announcements"));
    } catch (err) {
      setError(getApiErrorMessage(err));
    }
  }

  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => items.filter((item) => {
    const matchesQuery = [item.title, item.body, item.audience].some((value) => String(value ?? "").toLowerCase().includes(query.toLowerCase()));
    const matchesPriority = priority === "All" || String(item.priority ?? "") === priority;
    return matchesQuery && matchesPriority;
  }), [items, priority, query]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    try {
      if (editingId) {
        await updateResource("announcements", editingId, form);
      } else {
        await createResource("announcements", form);
      }
      setEditingId(null);
      setForm(emptyForm);
      await load();
    } catch (err) {
      setError(getApiErrorMessage(err));
    }
  }

  function edit(item: HrRecord) {
    setEditingId(Number(item.id));
    setForm({
      title: String(item.title ?? ""),
      body: String(item.body ?? ""),
      audience: String(item.audience ?? "All Staff"),
      publish_date: String(item.publish_date ?? ""),
      start_date: String(item.start_date ?? ""),
      end_date: String(item.end_date ?? ""),
      priority: String(item.priority ?? "Normal"),
      status: String(item.status ?? "Draft")
    });
  }

  return (
    <div>
      <HrPortalHeader title="Announcement Publishing" description="Restored publishing workflow with audience targeting, publish windows, and priority controls similar to the original SharePoint portal." breadcrumb="Announcements" />
      {error ? <p className="mb-6 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</p> : null}
      <section className="mb-8 grid gap-4 lg:grid-cols-[1fr_auto]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title, audience, body" className="w-full rounded-2xl border border-white/10 bg-slate-950 px-11 py-3 text-sm text-white" />
        </div>
        <div className="flex flex-wrap gap-2">
          {priorities.map((item) => (
            <button key={item} onClick={() => setPriority(item)} className={`rounded-full px-4 py-2 text-sm ${priority === item ? "bg-cyan-400 text-slate-950" : "border border-white/10 bg-white/5 text-slate-300"}`}>
              {item}
            </button>
          ))}
        </div>
      </section>
      <section className="grid gap-8 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-4">
          {filtered.map((item) => (
            <article key={String(item.id)} className="rounded-[2rem] border border-white/10 bg-white/5 p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3"><div className="rounded-2xl bg-cyan-400/10 p-3 text-cyan-300"><Megaphone className="h-5 w-5" /></div><div><h2 className="text-xl font-semibold text-white">{String(item.title ?? "Announcement")}</h2><p className="mt-1 text-sm text-slate-400">Audience: {String(item.audience ?? "All Staff")}</p></div></div>
                <span className="rounded-full bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.2em] text-slate-300">{String(item.priority ?? "Normal")}</span>
              </div>
              <p className="mt-4 text-sm leading-7 text-slate-300">{String(item.body ?? "No message body provided.")}</p>
              <div className="mt-4 flex flex-wrap gap-3 text-xs uppercase tracking-[0.2em] text-slate-500">
                <span>Publish {String(item.publish_date ?? "-")}</span>
                <span>Start {String(item.start_date ?? "-")}</span>
                <span>End {String(item.end_date ?? "-")}</span>
                <span>Status {String(item.status ?? "Draft")}</span>
              </div>
              <div className="mt-5 flex gap-3">
                <button onClick={() => edit(item)} className="rounded-full bg-cyan-400/10 p-2 text-cyan-300"><Edit3 className="h-4 w-4" /></button>
                <button onClick={() => void deleteResource("announcements", Number(item.id)).then(load).catch((err) => setError(getApiErrorMessage(err)))} className="rounded-full bg-rose-400/10 p-2 text-rose-300"><Trash2 className="h-4 w-4" /></button>
              </div>
            </article>
          ))}
        </div>
        <div className="rounded-[2rem] border border-white/10 bg-slate-900/60 p-6">
          <div className="mb-5 flex items-center gap-3"><div className="rounded-2xl bg-cyan-400/10 p-3 text-cyan-300"><Plus className="h-5 w-5" /></div><div><h2 className="text-xl font-semibold text-white">{editingId ? "Edit announcement" : "Publish announcement"}</h2><p className="mt-1 text-sm text-slate-400">Capture the same key fields the SPFx portal used for publishing.</p></div></div>
          <form onSubmit={submit} className="space-y-4">
            {Object.entries(form).map(([key, value]) => (
              <div key={key}>
                <label className="mb-2 block text-sm capitalize text-slate-300">{key.replaceAll("_", " ")}</label>
                {key === "body" ? (
                  <textarea value={value} onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))} className="min-h-32 w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-sm text-white" />
                ) : (
                  <input value={value} onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))} className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-sm text-white" />
                )}
              </div>
            ))}
            <button className="w-full rounded-2xl bg-cyan-400 px-4 py-3 font-medium text-slate-950">{editingId ? "Save announcement" : "Publish announcement"}</button>
          </form>
        </div>
      </section>
    </div>
  );
}
