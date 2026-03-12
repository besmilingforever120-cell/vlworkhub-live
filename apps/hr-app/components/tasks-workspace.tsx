"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clock3, PauseCircle, PlayCircle, Plus, Search, Target } from "lucide-react";
import { createResource, getApiErrorMessage, getResource, type HrRecord, updateResource } from "../lib/hr-client";
import { HrPortalHeader } from "./hr-portal-header";

const columns = ["Not Started", "In Progress", "Completed", "Blocked"];
const nextStatus: Record<string, string> = {
  "Not Started": "In Progress",
  "In Progress": "Completed",
  Completed: "Completed",
  Blocked: "In Progress"
};

export function TasksWorkspace() {
  const emptyForm = {
    title: "",
    assigned_to: "",
    due_date: "",
    status: "Not Started",
    priority: "Normal",
    description: ""
  };

  const [tasks, setTasks] = useState<HrRecord[]>([]);
  const [query, setQuery] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");

  async function load() {
    try {
      setTasks(await getResource("tasks"));
    } catch (err) {
      setError(getApiErrorMessage(err));
    }
  }

  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => tasks.filter((item) => [item.title, item.assigned_to, item.description].some((value) => String(value ?? "").toLowerCase().includes(query.toLowerCase()))), [query, tasks]);

  const grouped = useMemo(() => Object.fromEntries(columns.map((status) => [status, filtered.filter((task) => String(task.status ?? "Not Started") === status)])), [filtered]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await createResource("tasks", form);
      setForm(emptyForm);
      await load();
    } catch (err) {
      setError(getApiErrorMessage(err));
    }
  }

  async function advanceTask(task: HrRecord) {
    try {
      const status = String(task.status ?? "Not Started");
      await updateResource("tasks", Number(task.id), {
        title: String(task.title ?? ""),
        assigned_to: String(task.assigned_to ?? ""),
        due_date: String(task.due_date ?? ""),
        status: nextStatus[status] || status,
        priority: String(task.priority ?? "Normal"),
        description: String(task.description ?? "")
      });
      await load();
    } catch (err) {
      setError(getApiErrorMessage(err));
    }
  }

  return (
    <div>
      <HrPortalHeader title="Task Workflow" description="Restored task management workflow with intake, assignee tracking, status progression, and due-date visibility." breadcrumb="Tasks" />
      {error ? <p className="mb-6 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</p> : null}
      <section className="mb-8 grid gap-4 lg:grid-cols-[1fr_0.8fr]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search task title, assignee, description" className="w-full rounded-2xl border border-white/10 bg-slate-950 px-11 py-3 text-sm text-white" />
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4"><p className="text-sm text-slate-400">Open tasks</p><p className="mt-2 text-2xl font-semibold text-white">{tasks.filter((item) => String(item.status) !== "Completed").length}</p></div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4"><p className="text-sm text-slate-400">In progress</p><p className="mt-2 text-2xl font-semibold text-white">{tasks.filter((item) => String(item.status) === "In Progress").length}</p></div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4"><p className="text-sm text-slate-400">High priority</p><p className="mt-2 text-2xl font-semibold text-white">{tasks.filter((item) => ["High", "Critical"].includes(String(item.priority))).length}</p></div>
        </div>
      </section>
      <section className="mb-8 rounded-[2rem] border border-white/10 bg-slate-900/60 p-6">
        <div className="mb-5 flex items-center gap-3"><div className="rounded-2xl bg-cyan-400/10 p-3 text-cyan-300"><Plus className="h-5 w-5" /></div><div><h2 className="text-xl font-semibold text-white">Create task</h2><p className="mt-1 text-sm text-slate-400">Capture title, owner, due date, priority, and detailed notes.</p></div></div>
        <form onSubmit={submit} className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Object.entries(form).map(([key, value]) => (
            <div key={key} className={key === "description" ? "md:col-span-2 xl:col-span-3" : ""}>
              <label className="mb-2 block text-sm capitalize text-slate-300">{key.replaceAll("_", " ")}</label>
              {key === "description" ? (
                <textarea value={value} onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))} className="min-h-28 w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-sm text-white" />
              ) : (
                <input value={value} onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))} className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-sm text-white" />
              )}
            </div>
          ))}
          <button className="rounded-2xl bg-cyan-400 px-4 py-3 font-medium text-slate-950">Create workflow item</button>
        </form>
      </section>
      <section className="grid gap-5 xl:grid-cols-4">
        {columns.map((column) => (
          <div key={column} className="rounded-[2rem] border border-white/10 bg-white/5 p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">{column}</h2>
              <span className="rounded-full bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.2em] text-slate-400">{grouped[column].length}</span>
            </div>
            <div className="space-y-4">
              {grouped[column].map((task) => (
                <article key={String(task.id)} className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-medium text-white">{String(task.title ?? "Task")}</h3>
                      <p className="mt-2 text-sm text-slate-400">{String(task.assigned_to ?? "Unassigned")}</p>
                    </div>
                    <div className="rounded-full bg-cyan-400/10 px-3 py-1 text-xs uppercase tracking-[0.2em] text-cyan-300">{String(task.priority ?? "Normal")}</div>
                  </div>
                  <p className="mt-3 text-sm text-slate-300">{String(task.description ?? "No description")}</p>
                  <p className="mt-3 text-xs uppercase tracking-[0.2em] text-slate-500">Due {String(task.due_date ?? "-")}</p>
                  <button onClick={() => void advanceTask(task)} className="mt-4 inline-flex items-center gap-2 rounded-full bg-cyan-400 px-4 py-2 text-sm font-medium text-slate-950">
                    {column === "Completed" ? <CheckCircle2 className="h-4 w-4" /> : column === "Blocked" ? <PauseCircle className="h-4 w-4" /> : column === "In Progress" ? <PlayCircle className="h-4 w-4" /> : <Clock3 className="h-4 w-4" />}
                    {column === "Completed" ? "Completed" : column === "Blocked" ? "Resume task" : column === "In Progress" ? "Mark complete" : "Start task"}
                  </button>
                </article>
              ))}
              {!grouped[column].length ? <div className="rounded-2xl border border-dashed border-white/10 p-4 text-sm text-slate-500">No tasks in this stage.</div> : null}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
