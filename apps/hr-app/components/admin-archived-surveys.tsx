"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Calendar, ChevronDown, ChevronRight, ClipboardList, ExternalLink, Search, Shield } from "lucide-react";
import { getApiErrorMessage, getResource, type HrRecord } from "../lib/hr-client";

type ArchivedSurveyRecord = {
  key: string;
  userName: string;
  surveyTitle: string;
  surveyUrl: string;
  dueDate: string | null;
  completedOn: string | null;
};

type SurveyRow = HrRecord & {
  id: number;
  title?: string | number | null;
  url?: string | number | null;
};

type SurveyAssignmentRow = HrRecord & {
  id: number;
  survey_id?: string | number | null;
  title?: string | number | null;
  due_date?: string | number | null;
  status?: string | number | null;
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

function getSurveyHref(value: string) {
  const normalized = String(value || "").trim();
  if (!normalized) return "";
  if (normalized.startsWith("http://") || normalized.startsWith("https://")) return normalized;

  const iframeMatch = /src=["']([^"']+)["']/i.exec(normalized);
  return iframeMatch?.[1] ? String(iframeMatch[1]).trim() : "";
}

function isCompletionDone(item: HrRecord) {
  return Boolean(asString(item.completed_on));
}

export function AdminArchivedSurveys() {
  const [items, setItems] = useState<ArchivedSurveyRecord[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set());

  async function load() {
    try {
      setLoading(true);
      setError("");

      const [assignmentRows, completionRows, surveyRows] = await Promise.all([
        getResource("survey_assignments"),
        getResource("survey_completions"),
        getResource("surveys")
      ]);

      const assignments = (assignmentRows || []) as SurveyAssignmentRow[];
      const completions = completionRows || [];
      const surveys = (surveyRows || []) as SurveyRow[];

      const surveyById = new Map<string, SurveyRow>();
      for (const survey of surveys) {
        surveyById.set(asString(survey.id), survey);
      }

      const archivedAssignmentsById = new Map<string, SurveyAssignmentRow>();
      for (const assignment of assignments) {
        if (asString(assignment.status).toLowerCase() !== "archived") continue;
        archivedAssignmentsById.set(asString(assignment.id), assignment);
      }

      const nextItems: ArchivedSurveyRecord[] = [];
      for (const completion of completions) {
        if (!isCompletionDone(completion)) continue;

        const assignmentId = asString(completion.assignment_id);
        if (!assignmentId) continue;

        const assignment = archivedAssignmentsById.get(assignmentId);
        if (!assignment) continue;

        const survey = surveyById.get(asString(assignment.survey_id));
        const userName = asString(completion.user_name) || "Unknown User";
        const completedOn = asString(completion.completed_on) || null;
        const surveyTitle = asString(assignment.title) || asString(survey?.title) || "Survey";
        const surveyUrl = getSurveyHref(asString(survey?.url));

        nextItems.push({
          key: `${assignmentId}-${userName}-${completedOn || "-"}`,
          userName,
          surveyTitle,
          surveyUrl,
          dueDate: asString(assignment.due_date) || null,
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
    return items.filter((item) => [item.userName, item.surveyTitle, item.surveyUrl, item.dueDate || "", item.completedOn || ""].join(" ").toLowerCase().includes(normalizedQuery));
  }, [items, query]);

  const groupedItems = useMemo(() => {
    const groups = new Map<string, ArchivedSurveyRecord[]>();
    for (const item of filteredItems) {
      const key = item.userName || "Unknown User";
      const current = groups.get(key) || [];
      current.push(item);
      groups.set(key, current);
    }
    return Array.from(groups.entries()).map(([userName, surveysByUser]) => ({ userName, surveysByUser }));
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
          <h1 className="legacy-header__title">Archived Surveys</h1>
          <p className="legacy-header__subtitle">Review archived survey completions by user, including survey name, due date, and completion timestamp.</p>
          <div className="legacy-role"><Shield className="h-4 w-4" />Admin-only survey archive view</div>
        </div>
        <Link href="/admin" className="legacy-secondary-btn"><ArrowLeft className="h-4 w-4" />Back to Admin</Link>
      </div>

      {error ? <div className="hr-card" style={{ marginBottom: 20, color: "#7f1d1d", borderColor: "#fecaca", background: "#fff1f2" }}>{error}</div> : null}

      <section className="legacy-stats-grid">
        <div className="legacy-stat-card blue"><div className="legacy-stat-icon"><ClipboardList className="h-5 w-5" /></div><div><p className="legacy-stat-value">{groupedItems.length}</p><p className="legacy-stat-title">Users</p></div></div>
        <div className="legacy-stat-card green"><div className="legacy-stat-icon"><Calendar className="h-5 w-5" /></div><div><p className="legacy-stat-value">{filteredItems.length}</p><p className="legacy-stat-title">Archived Completions</p></div></div>
      </section>

      <section className="legacy-toolbar">
        <div className="legacy-toolbar__row">
          <div className="legacy-search"><Search className="h-4 w-4" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search user or survey..." /></div>
        </div>
      </section>

      {loading ? <div className="legacy-empty">Loading archived surveys...</div> : null}
      {!loading && !groupedItems.length ? <div className="legacy-empty">No archived survey completions found.</div> : null}

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
                  <th className="px-3 py-3">Survey</th>
                  <th className="px-3 py-3">Due Date</th>
                  <th className="px-3 py-3">Completed On</th>
                  <th className="px-3 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {group.surveysByUser.map((survey) => (
                  <tr key={survey.key} className="border-t border-gray-200">
                    <td className="px-3 py-4 text-sm font-semibold text-gray-900">{survey.surveyTitle}</td>
                    <td className="px-3 py-4 text-sm text-gray-700">{formatDate(survey.dueDate)}</td>
                    <td className="px-3 py-4 text-sm text-gray-700">{formatDate(survey.completedOn)}</td>
                    <td className="px-3 py-4">
                      {survey.surveyUrl ? (
                        <button type="button" className="legacy-secondary-btn" onClick={() => window.open(survey.surveyUrl, "_blank", "noopener,noreferrer")}>
                          <ExternalLink className="h-4 w-4" />Open Survey
                        </button>
                      ) : <span className="text-slate-400">No survey link</span>}
                    </td>
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
