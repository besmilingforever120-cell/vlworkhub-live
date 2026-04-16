"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Archive, ArrowLeft, ChevronDown, ChevronRight, ExternalLink, Search, Shield } from "lucide-react";
import { getApiErrorMessage, getResource, type HrRecord } from "../lib/hr-client";
import type { TrainingAssignmentRow, TrainingLibraryRow } from "../lib/training-helpers";

type ArchivedCompletionRow = {
  key: string;
  userName: string;
  trainingName: string;
  surveyUrl: string;
  completedOn: string | null;
};

function isCompletionDone(item: HrRecord) {
  return Number(item.progress_percent ?? 0) >= 100 || Boolean(String(item.completed_on ?? "").trim());
}

function parseCompletedTimestamp(value: string) {
  const normalized = String(value || "").trim();
  if (!normalized) return null;

  const hasTimezone = /([zZ]|[+-]\d{2}:?\d{2})$/.test(normalized);
  const candidate = hasTimezone ? normalized : `${normalized.replace(" ", "T")}Z`;
  const parsed = new Date(candidate);
  if (!Number.isNaN(parsed.getTime())) return parsed;

  const fallback = new Date(normalized);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

function formatDate(value: string | null) {
  if (!value) return "-";
  const parsed = parseCompletedTimestamp(value);
  if (!parsed) return value;
  return parsed.toLocaleString(undefined, { timeZone: "America/Los_Angeles" });
}

function getSurveyHref(value: string) {
  const normalized = String(value || "").trim();
  if (!normalized) return "";
  if (normalized.startsWith("http://") || normalized.startsWith("https://")) return normalized;

  const iframeMatch = /src=["']([^"']+)["']/i.exec(normalized);
  return iframeMatch?.[1] ? String(iframeMatch[1]).trim() : "";
}

export function AdminArchivedTrainings() {
  const [items, setItems] = useState<ArchivedCompletionRow[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set());

  async function load() {
    try {
      setLoading(true);
      setError("");

      const [assignmentRows, completionRows, trainingRows] = await Promise.all([
        getResource("training_assignments"),
        getResource("training_completions"),
        getResource("training")
      ]);

      const assignments = (assignmentRows || []) as TrainingAssignmentRow[];
      const completions = (completionRows || []) as HrRecord[];
      const trainingById = new Map<string, TrainingLibraryRow>();
      for (const row of (trainingRows || []) as TrainingLibraryRow[]) {
        trainingById.set(String(row.id), row);
      }

      const archivedAssignmentsById = new Map<string, TrainingAssignmentRow>();
      for (const assignment of assignments) {
        if (String(assignment.status ?? "").trim().toLowerCase() !== "archived") continue;
        archivedAssignmentsById.set(String(assignment.id), assignment);
      }

      const nextItems: ArchivedCompletionRow[] = [];
      for (const completion of completions) {
        if (!isCompletionDone(completion)) continue;
        const assignmentId = String(completion.assignment_id ?? "").trim();
        if (!assignmentId) continue;

        const assignment = archivedAssignmentsById.get(assignmentId);
        if (!assignment) continue;

        const training = trainingById.get(String(assignment.training_id ?? ""));
        const userName = String(completion.user_name ?? "").trim() || "Unknown User";
        const completedOn = String(completion.completed_on ?? "").trim() || null;
        const surveyUrl = getSurveyHref(String(assignment.survey_url ?? "").trim() || String(training?.quiz_iframe_link ?? "").trim());
        const trainingName = String(assignment.title ?? training?.training_name ?? "Training").trim() || "Training";

        nextItems.push({
          key: `${assignmentId}-${userName}-${completedOn || "-"}`,
          userName,
          trainingName,
          surveyUrl,
          completedOn
        });
      }

      nextItems.sort((a, b) => {
        const aTime = a.completedOn ? (parseCompletedTimestamp(a.completedOn)?.getTime() || 0) : 0;
        const bTime = b.completedOn ? (parseCompletedTimestamp(b.completedOn)?.getTime() || 0) : 0;
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
    return items.filter((item) => [item.userName, item.trainingName, item.surveyUrl, item.completedOn || ""].join(" ").toLowerCase().includes(normalizedQuery));
  }, [items, query]);

  const groupedItems = useMemo(() => {
    const groups = new Map<string, ArchivedCompletionRow[]>();
    for (const item of filteredItems) {
      const key = item.userName || "Unknown User";
      const current = groups.get(key) || [];
      current.push(item);
      groups.set(key, current);
    }
    return Array.from(groups.entries()).map(([userName, records]) => ({ userName, records }));
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
          <h1 className="legacy-header__title">Archived Training Completions</h1>
          <p className="legacy-header__subtitle">Review archived training assignments by user, including training name, survey link, and completion timestamp.</p>
          <div className="legacy-role"><Shield className="h-4 w-4" />Admin-only training archive view</div>
        </div>
        <Link href="/admin" className="legacy-secondary-btn"><ArrowLeft className="h-4 w-4" />Back to Admin</Link>
      </div>

      {error ? <div className="hr-card" style={{ marginBottom: 20, color: "#7f1d1d", borderColor: "#fecaca", background: "#fff1f2" }}>{error}</div> : null}

      <section className="legacy-stats-grid">
        <div className="legacy-stat-card blue"><div className="legacy-stat-icon"><Archive className="h-5 w-5" /></div><div><p className="legacy-stat-value">{groupedItems.length}</p><p className="legacy-stat-title">Users</p></div></div>
        <div className="legacy-stat-card green"><div className="legacy-stat-icon"><Archive className="h-5 w-5" /></div><div><p className="legacy-stat-value">{filteredItems.length}</p><p className="legacy-stat-title">Archived Completions</p></div></div>
      </section>

      <section className="legacy-toolbar">
        <div className="legacy-toolbar__row">
          <div className="legacy-search"><Search className="h-4 w-4" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search user or training..." /></div>
        </div>
      </section>

      {loading ? <div className="legacy-empty">Loading archived trainings...</div> : null}
      {!loading && !groupedItems.length ? <div className="legacy-empty">No archived training completions found.</div> : null}

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
                  <th className="px-3 py-3">Training</th>
                  <th className="px-3 py-3">Survey</th>
                  <th className="px-3 py-3">Completed On</th>
                </tr>
              </thead>
              <tbody>
                {group.records.map((record) => (
                  <tr key={record.key} className="border-t border-gray-200">
                    <td className="px-3 py-4">
                      <div className="text-sm font-semibold text-gray-900">{record.trainingName}</div>
                    </td>
                    <td className="px-3 py-4">
                      {record.surveyUrl ? (
                        <button type="button" className="legacy-secondary-btn" onClick={() => window.open(record.surveyUrl, "_blank", "noopener,noreferrer")}>
                          <ExternalLink className="h-4 w-4" />Open Survey
                        </button>
                      ) : <span className="text-slate-400">No survey link</span>}
                    </td>
                    <td className="px-3 py-4 text-sm text-gray-700">{formatDate(record.completedOn)}</td>
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
