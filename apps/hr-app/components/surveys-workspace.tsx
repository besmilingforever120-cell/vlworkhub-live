"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ClipboardList, Plus, Save, Search, Shield, X } from "lucide-react";
import type { SessionUser } from "@vlworkhub/types";
import {
  createResource,
  getApiErrorMessage,
  getCurrentUser,
  getHrAssignments,
  getResource,
  getSharedUsers,
  updateResource,
  type HrAssignment,
  type HrRecord,
  type HrUser
} from "../lib/hr-client";
import { useHrRole } from "../lib/use-hr-role";
import { HrPortalHeader } from "./hr-portal-header";
import { canCreateForHrRole, formatDate, formatHrRoleLabel, getVisibleHrUserNames, joinAssignees, splitAssignees } from "../lib/workflow-utils";

type SurveyForm = {
  title: string;
  url: string;
  due_date: string;
  status: string;
};

type SurveyAssignmentForm = {
  survey_id: string;
  due_date: string;
  status: string;
  assignees: string[];
};

function emptySurveyForm(): SurveyForm {
  return { title: "", url: "", due_date: "", status: "Active" };
}

function emptyAssignmentForm(): SurveyAssignmentForm {
  return { survey_id: "", due_date: "", status: "Assigned", assignees: [] };
}

export function SurveysWorkspace() {
  const { role: hrRole } = useHrRole();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [users, setUsers] = useState<HrUser[]>([]);
  const [hrAssignments, setHrAssignments] = useState<HrAssignment[]>([]);
  const [surveys, setSurveys] = useState<HrRecord[]>([]);
  const [assignments, setAssignments] = useState<HrRecord[]>([]);
  const [completions, setCompletions] = useState<HrRecord[]>([]);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showSurveyForm, setShowSurveyForm] = useState(false);
  const [showAssignmentForm, setShowAssignmentForm] = useState(false);
  const [surveyForm, setSurveyForm] = useState<SurveyForm>(emptySurveyForm());
  const [assignmentForm, setAssignmentForm] = useState<SurveyAssignmentForm>(emptyAssignmentForm());
  const [error, setError] = useState("");

  async function load() {
    try {
      setError("");
      const [session, platformUsers, roleRows, surveyData, assignmentData, completionData] = await Promise.all([
        getCurrentUser(),
        getSharedUsers(),
        getHrAssignments(),
        getResource("surveys"),
        getResource("survey_assignments"),
        getResource("survey_completions")
      ]);
      setUser(session);
      setUsers(platformUsers);
      setHrAssignments(roleRows.items || []);
      setSurveys(surveyData);
      setAssignments(assignmentData);
      setCompletions(completionData);
      setSelectedId((current) => current ?? Number(assignmentData[0]?.id ?? null));
    } catch (loadError) {
      setError(getApiErrorMessage(loadError));
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const canManage = canCreateForHrRole(hrRole);
  const visibleNames = useMemo(
    () => getVisibleHrUserNames(hrRole, user?.id || "", user?.fullName || "", hrAssignments, users),
    [hrAssignments, hrRole, user?.fullName, user?.id, users]
  );

  const completionMap = useMemo(() => {
    return completions.reduce<Record<string, HrRecord[]>>((acc, item) => {
      const key = String(item.assignment_id ?? "");
      acc[key] = [...(acc[key] || []), item];
      return acc;
    }, {});
  }, [completions]);

  const filteredAssignments = useMemo(() => {
    const visible = hrRole === "admin"
      ? assignments
      : assignments.filter((assignment) => splitAssignees(assignment.assignee_name).some((name) => visibleNames.includes(name)));
    return visible.filter((assignment) => {
      const survey = surveys.find((item) => Number(item.id) === Number(assignment.survey_id));
      const haystack = [assignment.title, assignment.assignee_name, survey?.title]
        .map((value) => String(value ?? "").toLowerCase());
      return haystack.some((value) => value.includes(query.toLowerCase()));
    });
  }, [assignments, hrRole, query, surveys, visibleNames]);

  const selected = useMemo(
    () => filteredAssignments.find((assignment) => Number(assignment.id) === selectedId) || filteredAssignments[0] || null,
    [filteredAssignments, selectedId]
  );

  const stats = {
    library: surveys.length,
    assignments: filteredAssignments.length,
    completions: completions.length
  };

  async function createSurvey() {
    try {
      await createResource("surveys", surveyForm);
      setSurveyForm(emptySurveyForm());
      setShowSurveyForm(false);
      await load();
    } catch (submitError) {
      setError(getApiErrorMessage(submitError));
    }
  }

  async function assignSurvey() {
    try {
      const survey = surveys.find((item) => Number(item.id) === Number(assignmentForm.survey_id));
      await createResource("survey_assignments", {
        title: String(survey?.title ?? "Survey assignment"),
        survey_id: assignmentForm.survey_id,
        assignee_name: joinAssignees(assignmentForm.assignees),
        due_date: assignmentForm.due_date,
        status: assignmentForm.status
      });
      setAssignmentForm(emptyAssignmentForm());
      setShowAssignmentForm(false);
      await load();
    } catch (submitError) {
      setError(getApiErrorMessage(submitError));
    }
  }

  async function markComplete(assignment: HrRecord) {
    try {
      const existing = (completionMap[String(assignment.id)] || []).find((item) => String(item.user_name ?? "") === user?.fullName);
      const payload = {
        assignment_id: String(assignment.id),
        user_name: user?.fullName || "",
        completed_on: new Date().toISOString()
      };
      if (existing) {
        await updateResource("survey_completions", Number(existing.id), payload);
      } else {
        await createResource("survey_completions", payload);
      }
      await load();
    } catch (completeError) {
      setError(getApiErrorMessage(completeError));
    }
  }

  return (
    <div className="legacy-portal">
      <HrPortalHeader
        title="Surveys"
        description="The surveys page now follows the SharePoint portal structure with survey library records, assignment tracking, and a right-side completion pane."
        breadcrumb="Surveys"
      />
      {error ? <div className="hr-card" style={{ marginBottom: 20, color: "#b91c1c", borderColor: "#fecaca", background: "#fff1f2" }}>{error}</div> : null}

      <div className="legacy-header">
        <div>
          <h1 className="legacy-header__title">Surveys</h1>
          <p className="legacy-header__subtitle">Distribute surveys, monitor completion, and keep compliance workflows visible across the portal.</p>
          <div className="legacy-role"><Shield className="h-4 w-4" />HR Role: {formatHrRoleLabel(hrRole)}</div>
        </div>
        {canManage ? (
          <div className="legacy-actions-row">
            <button type="button" className="legacy-secondary-btn" onClick={() => setShowSurveyForm(true)}><Plus className="h-4 w-4" />Add Survey</button>
            <button type="button" className="legacy-primary-btn" onClick={() => setShowAssignmentForm(true)}><ClipboardList className="h-4 w-4" />Assign Survey</button>
          </div>
        ) : null}
      </div>

      <section className="legacy-stats-grid">
        {[{ label: "Survey Library", value: stats.library, icon: ClipboardList, color: "blue" }, { label: "Visible Assignments", value: stats.assignments, icon: Plus, color: "amber" }, { label: "Completed", value: stats.completions, icon: CheckCircle2, color: "green" }].map((stat) => (
          <div key={stat.label} className={`legacy-stat-card ${stat.color}`}>
            <div className="legacy-stat-icon"><stat.icon className="h-5 w-5" /></div>
            <div><p className="legacy-stat-value">{stat.value}</p><p className="legacy-stat-title">{stat.label}</p></div>
          </div>
        ))}
      </section>

      <section className="legacy-toolbar">
        <div className="legacy-toolbar__row">
          <div className="legacy-search"><Search className="h-4 w-4" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search surveys or assignees..." /></div>
        </div>
      </section>

      <div className="legacy-split">
        <div className="legacy-panel">
          <div className="legacy-panel-header"><div><h2>Survey Library</h2><p>Published survey items remain visible in the same table-led format as the SPFx portal.</p></div></div>
          <div className="legacy-panel-body">
            <table className="legacy-table">
              <thead><tr><th>Title</th><th>Due Date</th><th>Status</th></tr></thead>
              <tbody>
                {surveys.map((survey) => (
                  <tr key={String(survey.id)}>
                    <td><div className="legacy-table-title">{String(survey.title ?? "Survey")}</div><div className="legacy-table-subtitle">{String(survey.url ?? "No URL")}</div></td>
                    <td>{formatDate(survey.due_date)}</td>
                    <td><span className="legacy-status default">{String(survey.status ?? "Active")}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="legacy-panel">
          <div className="legacy-panel-header"><div><h2>Survey Assignments</h2><p>Assignment tracking remains separated from the library and mirrors the portal completion cards.</p></div></div>
          <div className="legacy-panel-body">
            <div className="legacy-grid-cards legacy-grid-cards--single">
              {filteredAssignments.length ? filteredAssignments.map((assignment) => {
                const people = splitAssignees(assignment.assignee_name);
                const assignmentCompletions = completionMap[String(assignment.id)] || [];
                const completedCount = assignmentCompletions.length;
                const mine = people.includes(user?.fullName || "");
                return (
                  <article key={String(assignment.id)} className="legacy-card legacy-card--compact">
                    <div className="legacy-card-header">
                      <div>
                        <h3 className="legacy-card-title">{String(assignment.title ?? "Survey assignment")}</h3>
                        <p className="legacy-card-muted">Due {formatDate(assignment.due_date)} · {people.length} assignee(s)</p>
                      </div>
                      <span className={`legacy-status ${completedCount >= people.length && people.length ? "completed" : "progress"}`}>{completedCount}/{people.length || 1} complete</span>
                    </div>
                    <div className="legacy-chip-list">
                      {people.map((name) => {
                        const done = assignmentCompletions.some((item) => String(item.user_name ?? "") === name);
                        return <span key={name} className={`legacy-chip ${done ? "complete" : "pending"}`}>{name}</span>;
                      })}
                    </div>
                    <div className="legacy-actions-row" style={{ marginTop: 16 }}>
                      <button type="button" className="legacy-secondary-btn" onClick={() => setSelectedId(Number(assignment.id))}>View Details</button>
                      {mine && !assignmentCompletions.some((item) => String(item.user_name ?? "") === user?.fullName) ? <button type="button" className="legacy-primary-btn" onClick={() => void markComplete(assignment)}><CheckCircle2 className="h-4 w-4" />Mark Complete</button> : null}
                    </div>
                  </article>
                );
              }) : <div className="legacy-empty">No survey assignments match the current query.</div>}
            </div>
          </div>
        </div>

        <aside className="legacy-panel">
          <div className="legacy-panel-header"><div><h2>Assignment Detail</h2><p>Completion detail and assignee state remain visible in the right panel.</p></div></div>
          <div className="legacy-panel-body">
            {selected ? (
              <div className="legacy-detail-stack">
                <div className="legacy-detail-card">
                  <h3>{String(selected.title ?? "Survey assignment")}</h3>
                  <p>Due {formatDate(selected.due_date)}</p>
                  <p>Status: {String(selected.status ?? "Assigned")}</p>
                </div>
                <div className="legacy-detail-card">
                  <h4>Assignees</h4>
                  <div className="legacy-chip-list">
                    {splitAssignees(selected.assignee_name).map((name) => {
                      const done = (completionMap[String(selected.id)] || []).some((item) => String(item.user_name ?? "") === name);
                      return <span key={name} className={`legacy-chip ${done ? "complete" : "pending"}`}>{name}</span>;
                    })}
                  </div>
                </div>
                <div className="legacy-detail-card"><div className="legacy-role"><Shield className="h-4 w-4" />HR Role: {formatHrRoleLabel(hrRole)}</div></div>
              </div>
            ) : <div className="legacy-empty">Select an assignment to inspect survey completion detail.</div>}
          </div>
        </aside>
      </div>

      {showSurveyForm ? (
        <div className="legacy-modal-overlay">
          <div className="legacy-modal">
            <div className="legacy-modal-header"><h2>Create Survey</h2><button type="button" className="legacy-icon-btn" onClick={() => setShowSurveyForm(false)}><X className="h-4 w-4" /></button></div>
            <div className="legacy-modal-body">
              <div className="legacy-form-grid">
                <div className="legacy-form-group legacy-form-group--full"><label>Title</label><input value={surveyForm.title} onChange={(event) => setSurveyForm((current) => ({ ...current, title: event.target.value }))} /></div>
                <div className="legacy-form-group legacy-form-group--full"><label>URL</label><input value={surveyForm.url} onChange={(event) => setSurveyForm((current) => ({ ...current, url: event.target.value }))} /></div>
                <div className="legacy-form-group"><label>Due Date</label><input type="date" value={surveyForm.due_date} onChange={(event) => setSurveyForm((current) => ({ ...current, due_date: event.target.value }))} /></div>
                <div className="legacy-form-group"><label>Status</label><select value={surveyForm.status} onChange={(event) => setSurveyForm((current) => ({ ...current, status: event.target.value }))}>{["Active", "Draft", "Archived"].map((value) => <option key={value} value={value}>{value}</option>)}</select></div>
              </div>
            </div>
            <div className="legacy-modal-footer"><button type="button" className="legacy-secondary-btn" onClick={() => setShowSurveyForm(false)}>Cancel</button><button type="button" className="legacy-primary-btn" onClick={() => void createSurvey()}><Save className="h-4 w-4" />Create Survey</button></div>
          </div>
        </div>
      ) : null}

      {showAssignmentForm ? (
        <div className="legacy-modal-overlay">
          <div className="legacy-modal">
            <div className="legacy-modal-header"><h2>Assign Survey</h2><button type="button" className="legacy-icon-btn" onClick={() => setShowAssignmentForm(false)}><X className="h-4 w-4" /></button></div>
            <div className="legacy-modal-body">
              <div className="legacy-form-grid">
                <div className="legacy-form-group legacy-form-group--full"><label>Survey</label><select value={assignmentForm.survey_id} onChange={(event) => setAssignmentForm((current) => ({ ...current, survey_id: event.target.value }))}><option value="">Select survey</option>{surveys.map((survey) => <option key={String(survey.id)} value={String(survey.id)}>{String(survey.title ?? "Survey")}</option>)}</select></div>
                <div className="legacy-form-group"><label>Due Date</label><input type="date" value={assignmentForm.due_date} onChange={(event) => setAssignmentForm((current) => ({ ...current, due_date: event.target.value }))} /></div>
                <div className="legacy-form-group"><label>Status</label><select value={assignmentForm.status} onChange={(event) => setAssignmentForm((current) => ({ ...current, status: event.target.value }))}>{["Assigned", "Completed"].map((value) => <option key={value} value={value}>{value}</option>)}</select></div>
                <div className="legacy-form-group legacy-form-group--full"><label>Assigned To</label><div className="legacy-chip-list">{users.filter((option) => hrRole === "admin" || visibleNames.includes(option.fullName) || option.id === user?.id).map((option) => { const selected = assignmentForm.assignees.includes(option.fullName); return <button key={option.id} type="button" className={`legacy-filter-btn ${selected ? "is-active" : ""}`} onClick={() => setAssignmentForm((current) => ({ ...current, assignees: selected ? current.assignees.filter((name) => name !== option.fullName) : [...current.assignees, option.fullName] }))}>{option.fullName}</button>; })}</div></div>
              </div>
            </div>
            <div className="legacy-modal-footer"><button type="button" className="legacy-secondary-btn" onClick={() => setShowAssignmentForm(false)}>Cancel</button><button type="button" className="legacy-primary-btn" onClick={() => void assignSurvey()}><Save className="h-4 w-4" />Create Assignment</button></div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
