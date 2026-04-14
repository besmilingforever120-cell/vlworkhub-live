"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Archive, Calendar, ChevronDown, ChevronRight, Search, Shield } from "lucide-react";
import { getApiErrorMessage, getArchivedTasks, getResource, type HrRecord } from "../lib/hr-client";

type ArchivedTaskRecord = {
  key: string;
  userName: string;
  taskTitle: string;
  taskDescription: string;
  dueDate: string | null;
  completedOn: string | null;
};

function asString(value: string | number | null | undefined) {
  return String(value ?? "").trim();
}

function formatDate(value: string | null) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

function isCompletionDone(item: HrRecord) {
  return asString(item.status).toUpperCase() === "COMPLETED" || Boolean(asString(item.completed_on));
}

export function AdminArchivedTasks() {
  const [items, setItems] = useState<ArchivedTaskRecord[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set());

  async function load() {
    try {
      setLoading(true);
      setError("");

      const [archivedTasksResponse, completionRows] = await Promise.all([
        getArchivedTasks(),
        getResource("task_completion")
      ]);

      const archivedTasks = archivedTasksResponse.items || [];
      const archivedTasksById = new Map<string, HrRecord>();
      for (const task of archivedTasks) {
        archivedTasksById.set(asString(task.id), task);
      }

      const nextItems: ArchivedTaskRecord[] = [];
      for (const completion of completionRows || []) {
        if (!isCompletionDone(completion)) continue;

        const taskId = asString(completion.task_id);
        const task = archivedTasksById.get(taskId);
        if (!task) continue;

        const userName = asString(completion.user_name) || "Unknown User";
        const completedOn = asString(completion.completed_on) || null;

        nextItems.push({
          key: `${taskId}-${userName}-${completedOn || "-"}`,
          userName,
          taskTitle: asString(task.title) || "Task",
          taskDescription: asString(task.description),
          dueDate: asString(task.due_date) || null,
          completedOn
        });
      }

      nextItems.sort((a, b) => {
        const aTime = a.completedOn ? new Date(a.completedOn).getTime() : 0;
        const bTime = b.completedOn ? new Date(b.completedOn).getTime() : 0;
        return bTime - aTime;
      });

      setItems(nextItems);
    } catch (loadError) {
      setItems([]);
      setError(getApiErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return items;
    return items.filter((item) => [item.userName, item.taskTitle, item.taskDescription, item.dueDate || "", item.completedOn || ""].join(" ").toLowerCase().includes(normalizedQuery));
  }, [items, query]);

  const groupedItems = useMemo(() => {
    const groups = new Map<string, ArchivedTaskRecord[]>();
    for (const item of filteredItems) {
      const key = item.userName || "Unknown User";
      const current = groups.get(key) || [];
      current.push(item);
      groups.set(key, current);
    }
    return Array.from(groups.entries()).map(([userName, tasks]) => ({ userName, tasks }));
  }, [filteredItems]);

  function toggleUserExpansion(userName: string) {
    setExpandedUsers((current) => {
      const next = new Set(current);
      if (next.has(userName)) {
        next.delete(userName);
      } else {
        next.add(userName);
      }
      return next;
    });
  }

  return (
    <div className="legacy-portal">
      <div className="legacy-header">
        <div>
          <h1 className="legacy-header__title">Archived Tasks</h1>
          <p className="legacy-header__subtitle">Review archived tasks grouped by user, including title, description, due date, and completion timestamp.</p>
          <div className="legacy-role"><Shield className="h-4 w-4" />Admin-only task archive view</div>
        </div>
        <Link href="/admin" className="legacy-secondary-btn"><ArrowLeft className="h-4 w-4" />Back to Admin</Link>
      </div>

      {error ? <div className="hr-card" style={{ marginBottom: 20, color: "#7f1d1d", borderColor: "#fecaca", background: "#fff1f2" }}>{error}</div> : null}

      <section className="legacy-stats-grid">
        <div className="legacy-stat-card blue"><div className="legacy-stat-icon"><Archive className="h-5 w-5" /></div><div><p className="legacy-stat-value">{groupedItems.length}</p><p className="legacy-stat-title">Users</p></div></div>
        <div className="legacy-stat-card green"><div className="legacy-stat-icon"><Calendar className="h-5 w-5" /></div><div><p className="legacy-stat-value">{filteredItems.length}</p><p className="legacy-stat-title">Archived Completions</p></div></div>
      </section>

      <section className="legacy-toolbar">
        <div className="legacy-toolbar__row">
          <div className="legacy-search"><Search className="h-4 w-4" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search user or task..." /></div>
        </div>
      </section>

      {loading ? <div className="legacy-empty">Loading archived tasks...</div> : null}
      {!loading && !groupedItems.length ? <div className="legacy-empty">No archived task completions found.</div> : null}

      {!loading ? groupedItems.map((group) => (
        <section key={group.userName} className="legacy-card" style={{ marginBottom: 20 }}>
          <button
            type="button"
            className="legacy-card-header"
            style={{ width: "100%", justifyContent: "space-between", alignItems: "center", textAlign: "left", cursor: "pointer", background: "transparent", border: "none" }}
            onClick={() => toggleUserExpansion(group.userName)}
            aria-expanded={expandedUsers.has(group.userName)}
          >
            <h3 className="legacy-card-title">{group.userName}</h3>
            <span className="text-slate-500" aria-hidden="true">
              {expandedUsers.has(group.userName) ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
            </span>
          </button>

          {expandedUsers.has(group.userName) ? <div className="mt-5 overflow-x-auto">
            <table className="min-w-full text-left text-sm text-gray-700">
              <thead className="text-xs uppercase tracking-[0.16em] text-gray-500">
                <tr>
                  <th className="px-3 py-3">Task</th>
                  <th className="px-3 py-3">Description</th>
                  <th className="px-3 py-3">Due Date</th>
                  <th className="px-3 py-3">Completed On</th>
                </tr>
              </thead>
              <tbody>
                {group.tasks.map((task) => (
                  <tr key={task.key} className="border-t border-gray-200">
                    <td className="px-3 py-4 text-sm font-semibold text-gray-900">{task.taskTitle}</td>
                    <td className="px-3 py-4 text-sm text-gray-700">{task.taskDescription || "-"}</td>
                    <td className="px-3 py-4 text-sm text-gray-700">{formatDate(task.dueDate)}</td>
                    <td className="px-3 py-4 text-sm text-gray-700">{formatDate(task.completedOn)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div> : null}
        </section>
      )) : null}
    </div>
  );
}
