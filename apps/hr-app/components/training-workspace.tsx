"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { BookOpen, CheckCircle2, ClipboardCheck, ExternalLink, PlayCircle, Plus, Save, Search, Shield, Video, X } from "lucide-react";
import type { SessionUser } from "@vlworkhub/types";
import {
  createResource,
  getApiErrorMessage,
  getCurrentUser,
  getResource,
  getSharedUsers,
  updateResource,
  type HrRecord,
  type HrUser
} from "../lib/hr-client";
import { HrPortalHeader } from "./hr-portal-header";
import { formatDate, isHrManager, joinAssignees, splitAssignees } from "../lib/workflow-utils";

type TabKey = "my-training" | "assignments" | "surveys";

type LibraryForm = {
  title: string;
  audience: string;
  delivery_mode: string;
  content_url: string;
  status: string;
};

type AssignmentForm = {
  training_id: string;
  due_date: string;
  survey_url: string;
  status: string;
  assignees: string[];
};

type ValidationState = Partial<Record<keyof LibraryForm | keyof AssignmentForm, string>>;

const tabStorageKey = "vlworkhub.hr.training.tab";

function emptyLibraryForm(): LibraryForm {
  return {
    title: "",
    audience: "All Staff",
    delivery_mode: "Video",
    content_url: "",
    status: "Active"
  };
}

function emptyAssignmentForm(): AssignmentForm {
  return {
    training_id: "",
    due_date: "",
    survey_url: "",
    status: "Assigned",
    assignees: []
  };
}

function validateLibraryForm(form: LibraryForm): ValidationState {
  const next: ValidationState = {};
  if (!form.title.trim()) next.title = "Training title is required.";
  return next;
}

function validateAssignmentForm(form: AssignmentForm): ValidationState {
  const next: ValidationState = {};
  if (!form.training_id) next.training_id = "Select a training item.";
  if (!form.assignees.length) next.assignees = "Assign at least one user or group.";
  return next;
}

export function TrainingWorkspace() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [users, setUsers] = useState<HrUser[]>([]);
  const [library, setLibrary] = useState<HrRecord[]>([]);
  const [assignments, setAssignments] = useState<HrRecord[]>([]);
  const [completions, setCompletions] = useState<HrRecord[]>([]);
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState<TabKey>("my-training");
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<number | null>(null);
  const [showLibraryForm, setShowLibraryForm] = useState(false);
  const [showAssignmentForm, setShowAssignmentForm] = useState(false);
  const [libraryForm, setLibraryForm] = useState<LibraryForm>(emptyLibraryForm());
  const [assignmentForm, setAssignmentForm] = useState<AssignmentForm>(emptyAssignmentForm());
  const [libraryErrors, setLibraryErrors] = useState<ValidationState>({});
  const [assignmentErrors, setAssignmentErrors] = useState<ValidationState>({});
  const [error, setError] = useState("");

  async function load() {
    try {
      setError("");
      const [session, platformUsers, trainingData, assignmentData, completionData] = await Promise.all([
        getCurrentUser(),
        getSharedUsers(),
        getResource("training"),
        getResource("training_assignments"),
        getResource("training_completions")
      ]);
      setUser(session);
      setUsers(platformUsers);
      setLibrary(trainingData);
      setAssignments(assignmentData);
      setCompletions(completionData);
      setSelectedAssignmentId((current) => current ?? Number(assignmentData[0]?.id ?? null));
    } catch (loadError) {
      setError(getApiErrorMessage(loadError));
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    const saved = window.sessionStorage.getItem(tabStorageKey) as TabKey | null;
    if (saved === "my-training" || saved === "assignments" || saved === "surveys") {
      setActiveTab(saved);
    }
  }, []);

  useEffect(() => {
    window.sessionStorage.setItem(tabStorageKey, activeTab);
  }, [activeTab]);

  const canManage = isHrManager(user);

  const completionMap = useMemo(() => {
    return completions.reduce<Record<string, HrRecord[]>>((acc, item) => {
      const key = String(item.assignment_id ?? "");
      acc[key] = [...(acc[key] || []), item];
      return acc;
    }, {});
  }, [completions]);

  const allVisibleAssignments = useMemo(() => {
    const visible = canManage
      ? assignments
      : assignments.filter((assignment) => splitAssignees(assignment.assignee_name).includes(user?.fullName || ""));
    return visible.filter((assignment) => {
      const training = library.find((item) => Number(item.id) === Number(assignment.training_id));
      const haystack = [assignment.title, assignment.assignee_name, training?.title, assignment.survey_url]
        .map((value) => String(value ?? "").toLowerCase());
      return haystack.some((value) => value.includes(query.toLowerCase()));
    });
  }, [assignments, canManage, library, query, user?.fullName]);

  const myAssignments = useMemo(
    () => allVisibleAssignments.filter((assignment) => splitAssignees(assignment.assignee_name).includes(user?.fullName || "")),
    [allVisibleAssignments, user?.fullName]
  );

  const selectedAssignment = useMemo(() => {
    const source = activeTab === "my-training" ? myAssignments : allVisibleAssignments;
    return source.find((assignment) => Number(assignment.id) === selectedAssignmentId) || source[0] || null;
  }, [activeTab, allVisibleAssignments, myAssignments, selectedAssignmentId]);

  const linkedSurveys = useMemo(
    () => allVisibleAssignments.filter((assignment) => String(assignment.survey_url ?? "").trim()),
    [allVisibleAssignments]
  );

  const stats = {
    library: library.length,
    assignments: assignments.length,
    completed: completions.filter((item) => Number(item.progress_percent ?? 0) >= 100 || String(item.completed_on ?? "")).length,
    active: assignments.filter((item) => String(item.status ?? "") !== "Completed").length
  };

  async function createLibraryItem() {
    const nextErrors = validateLibraryForm(libraryForm);
    setLibraryErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    try {
      await createResource("training", libraryForm);
      setLibraryForm(emptyLibraryForm());
      setLibraryErrors({});
      setShowLibraryForm(false);
      await load();
    } catch (submitError) {
      setError(getApiErrorMessage(submitError));
    }
  }

  async function createAssignment() {
    const nextErrors = validateAssignmentForm(assignmentForm);
    setAssignmentErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    try {
      const training = library.find((item) => Number(item.id) === Number(assignmentForm.training_id));
      await createResource("training_assignments", {
        title: String(training?.title ?? "Training assignment"),
        training_id: assignmentForm.training_id,
        assignee_name: joinAssignees(assignmentForm.assignees),
        due_date: assignmentForm.due_date,
        survey_url: assignmentForm.survey_url,
        status: assignmentForm.status
      });
      setAssignmentForm(emptyAssignmentForm());
      setAssignmentErrors({});
      setShowAssignmentForm(false);
      await load();
    } catch (submitError) {
      setError(getApiErrorMessage(submitError));
    }
  }

  async function updateProgress(assignment: HrRecord) {
    try {
      const existing = (completionMap[String(assignment.id)] || []).find((item) => String(item.user_name ?? "") === user?.fullName);
      const current = Number(existing?.progress_percent ?? 0);
      const next = current >= 50 ? 100 : 50;
      const payload = {
        assignment_id: String(assignment.id),
        user_name: user?.fullName || "",
        progress_percent: String(next),
        completed_on: next === 100 ? new Date().toISOString() : "",
        last_position_seconds: String(next === 100 ? 1200 : 600)
      };
      if (existing) {
        await updateResource("training_completions", Number(existing.id), payload);
      } else {
        await createResource("training_completions", payload);
      }
      if (next === 100) {
        await updateResource("training_assignments", Number(assignment.id), {
          title: String(assignment.title ?? ""),
          training_id: String(assignment.training_id ?? ""),
          assignee_name: String(assignment.assignee_name ?? ""),
          due_date: String(assignment.due_date ?? ""),
          survey_url: String(assignment.survey_url ?? ""),
          status: "Completed"
        });
      }
      await load();
    } catch (progressError) {
      setError(getApiErrorMessage(progressError));
    }
  }

  const assignmentsToRender = activeTab === "my-training" ? myAssignments : allVisibleAssignments;

  return (
    <div className="legacy-portal">
      <HrPortalHeader
        title="Training"
        description="The training module now follows the SharePoint workspace structure with preserved tab state, inline validation, and the original assignment-detail workflow."
        breadcrumb="Training"
      />
      {error ? <div className="hr-card" style={{ marginBottom: 20, color: "#b91c1c", borderColor: "#fecaca", background: "#fff1f2" }}>{error}</div> : null}

      <div className="legacy-header">
        <div>
          <h1 className="legacy-header__title">Training</h1>
          <p className="legacy-header__subtitle">Manage the training library, assign learning, and monitor completion across the organization.</p>
          <div className="legacy-role"><Shield className="h-4 w-4" />Role: {user?.roles?.join(", ") || user?.role || "Employee"}</div>
        </div>
        {canManage ? (
          <div className="legacy-actions-row">
            <button type="button" className="legacy-secondary-btn" onClick={() => setShowLibraryForm(true)}><Video className="h-4 w-4" />Add Training</button>
            <button type="button" className="legacy-primary-btn" onClick={() => setShowAssignmentForm(true)}><Plus className="h-4 w-4" />Assign Training</button>
          </div>
        ) : null}
      </div>

      <section className="legacy-stats-grid">
        {[{ label: "Library Items", value: stats.library, icon: BookOpen, color: "blue" }, { label: "Assignments", value: stats.assignments, icon: ClipboardCheck, color: "amber" }, { label: "Completed", value: stats.completed, icon: CheckCircle2, color: "green" }, { label: "Active", value: stats.active, icon: PlayCircle, color: "red" }].map((stat) => (
          <div key={stat.label} className={`legacy-stat-card ${stat.color}`}>
            <div className="legacy-stat-icon"><stat.icon className="h-5 w-5" /></div>
            <div><p className="legacy-stat-value">{stat.value}</p><p className="legacy-stat-title">{stat.label}</p></div>
          </div>
        ))}
      </section>

      <section className="legacy-toolbar">
        <div className="legacy-toolbar__row">
          <div className="legacy-search"><Search className="h-4 w-4" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search training, assignees, or linked surveys..." /></div>
        </div>
      </section>

      <div className="legacy-tabs">
        <button type="button" className={`legacy-tab-btn ${activeTab === "my-training" ? "is-active" : ""}`} onClick={() => setActiveTab("my-training")}>My Training</button>
        <button type="button" className={`legacy-tab-btn ${activeTab === "assignments" ? "is-active" : ""}`} onClick={() => setActiveTab("assignments")}>Assignments</button>
        <button type="button" className={`legacy-tab-btn ${activeTab === "surveys" ? "is-active" : ""}`} onClick={() => setActiveTab("surveys")}>Surveys</button>
      </div>

      {activeTab === "surveys" ? (
        <div className="legacy-split">
          <div className="legacy-panel">
            <div className="legacy-panel-header"><div><h2>Linked Surveys</h2><p>Training-linked survey assignments mirror the SPFx survey tab placement and preserve the same sequence after tab switches.</p></div></div>
            <div className="legacy-panel-body">
              <div className="legacy-grid-cards legacy-grid-cards--single">
                {linkedSurveys.length ? linkedSurveys.map((assignment) => (
                  <article key={String(assignment.id)} className="legacy-card legacy-card--compact">
                    <div className="legacy-card-header">
                      <div>
                        <h3 className="legacy-card-title">{String(assignment.title ?? "Survey")}</h3>
                        <p className="legacy-card-muted">Due {formatDate(assignment.due_date)} · Linked from training</p>
                      </div>
                      <span className="legacy-status progress">Survey</span>
                    </div>
                    <p className="legacy-card-copy">{String(assignment.survey_url ?? "")}</p>
                    <div className="legacy-actions-row" style={{ marginTop: 16 }}>
                      <Link href="/surveys" className="legacy-primary-btn"><ExternalLink className="h-4 w-4" />Open Surveys Module</Link>
                    </div>
                  </article>
                )) : <div className="legacy-empty">No linked surveys are available for the current filters.</div>}
              </div>
            </div>
          </div>
          <aside className="legacy-panel">
            <div className="legacy-panel-header"><div><h2>Survey Context</h2><p>Use the dedicated surveys area for assignment and completion tracking.</p></div></div>
            <div className="legacy-panel-body">
              <div className="legacy-detail-stack">
                <div className="legacy-detail-card">
                  <h4>Next Step</h4>
                  <p>Open the surveys workspace to manage distribution, assignees, and completion history.</p>
                </div>
              </div>
            </div>
          </aside>
        </div>
      ) : (
        <div className="legacy-split">
          <div className="legacy-side-stack">
            {activeTab === "assignments" ? (
              <div className="legacy-panel">
                <div className="legacy-panel-header"><div><h2>Training Library</h2><p>Reference materials and learning assets published for HR operations.</p></div></div>
                <div className="legacy-panel-body">
                  <table className="legacy-table">
                    <thead><tr><th>Title</th><th>Audience</th><th>Mode</th><th>Status</th></tr></thead>
                    <tbody>
                      {library.map((item) => (
                        <tr key={String(item.id)}>
                          <td><div className="legacy-table-title">{String(item.title ?? "Training")}</div><div className="legacy-table-subtitle">{String(item.content_url ?? "No content URL")}</div></td>
                          <td>{String(item.audience ?? "All Staff")}</td>
                          <td>{String(item.delivery_mode ?? "Video")}</td>
                          <td><span className={`legacy-status ${String(item.status ?? "") === "Completed" ? "completed" : "default"}`}>{String(item.status ?? "Active")}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            <div className="legacy-panel">
              <div className="legacy-panel-header"><div><h2>{activeTab === "my-training" ? "My Training" : "Assignments"}</h2><p>{activeTab === "my-training" ? "Your assigned training, progress, and next actions." : "Track completion progress, deadlines, and linked follow-up surveys."}</p></div></div>
              <div className="legacy-panel-body">
                <div className="legacy-grid-cards legacy-grid-cards--single">
                  {assignmentsToRender.length ? assignmentsToRender.map((assignment) => {
                    const people = splitAssignees(assignment.assignee_name);
                    const assignmentCompletions = completionMap[String(assignment.id)] || [];
                    const completedCount = assignmentCompletions.filter((item) => Number(item.progress_percent ?? 0) >= 100 || String(item.completed_on ?? "")).length;
                    const percent = people.length ? Math.round((completedCount / people.length) * 100) : 0;
                    const mine = people.includes(user?.fullName || "");
                    const myProgress = Number(assignmentCompletions.find((item) => String(item.user_name ?? "") === user?.fullName)?.progress_percent ?? 0);
                    return (
                      <article key={String(assignment.id)} className={`legacy-card legacy-card--compact ${selectedAssignment && Number(selectedAssignment.id) === Number(assignment.id) ? "legacy-card--selected" : ""}`}>
                        <div className="legacy-card-header">
                          <div>
                            <h3 className="legacy-card-title">{String(assignment.title ?? "Training assignment")}</h3>
                            <p className="legacy-card-muted">Due {formatDate(assignment.due_date)} · Survey {String(assignment.survey_url || "Not linked")}</p>
                          </div>
                          <span className={`legacy-status ${String(assignment.status ?? "") === "Completed" ? "completed" : "progress"}`}>{String(assignment.status ?? "Assigned")}</span>
                        </div>
                        <div className="legacy-progress">
                          <div className="legacy-progress-header"><span>{completedCount} of {people.length || 1} complete</span><span>{percent}%</span></div>
                          <div className="legacy-progress-bar"><div className="legacy-progress-fill" style={{ width: `${percent}%` }} /></div>
                        </div>
                        <div className="legacy-chip-list">
                          {people.map((name) => {
                            const completion = assignmentCompletions.find((item) => String(item.user_name ?? "") === name);
                            const done = Number(completion?.progress_percent ?? 0) >= 100 || Boolean(completion?.completed_on);
                            return <span key={name} className={`legacy-chip ${done ? "complete" : "pending"}`}>{name}</span>;
                          })}
                        </div>
                        <div className="legacy-actions-row" style={{ marginTop: 16 }}>
                          <button type="button" className="legacy-secondary-btn" onClick={() => setSelectedAssignmentId(Number(assignment.id))}>View Details</button>
                          {mine && String(assignment.status ?? "") !== "Completed" ? <button type="button" className="legacy-primary-btn" onClick={() => void updateProgress(assignment)}>{myProgress >= 50 ? <CheckCircle2 className="h-4 w-4" /> : <PlayCircle className="h-4 w-4" />}{myProgress >= 50 ? "Complete Training" : "Start Training"}</button> : null}
                        </div>
                      </article>
                    );
                  }) : <div className="legacy-empty">No training assignments match the current query.</div>}
                </div>
              </div>
            </div>
          </div>

          <aside className="legacy-panel">
            <div className="legacy-panel-header"><div><h2>Assignment Detail</h2><p>Review assignees, completion state, and role context in the right-side detail panel.</p></div></div>
            <div className="legacy-panel-body">
              {selectedAssignment ? (
                <div className="legacy-detail-stack">
                  <div className="legacy-detail-card">
                    <h3>{String(selectedAssignment.title ?? "Training assignment")}</h3>
                    <p>Due {formatDate(selectedAssignment.due_date)}</p>
                    <p>{String(selectedAssignment.survey_url || "No survey linked")}</p>
                  </div>
                  <div className="legacy-detail-card">
                    <h4>Assignees</h4>
                    <div className="legacy-chip-list">
                      {splitAssignees(selectedAssignment.assignee_name).map((name) => {
                        const completion = (completionMap[String(selectedAssignment.id)] || []).find((item) => String(item.user_name ?? "") === name);
                        const value = Number(completion?.progress_percent ?? 0);
                        return <span key={name} className={`legacy-chip ${value >= 100 ? "complete" : value > 0 ? "progress" : "pending"}`}>{name}</span>;
                      })}
                    </div>
                  </div>
                  <div className="legacy-detail-card"><h4>Role Context</h4><div className="legacy-role"><Shield className="h-4 w-4" />Role: {user?.roles?.join(", ") || user?.role || "Employee"}</div></div>
                </div>
              ) : <div className="legacy-empty">Select an assignment to inspect completion details.</div>}
            </div>
          </aside>
        </div>
      )}

      {showLibraryForm ? (
        <div className="legacy-modal-overlay">
          <div className="legacy-modal">
            <div className="legacy-modal-header"><h2>Add Training Item</h2><button type="button" className="legacy-icon-btn" onClick={() => setShowLibraryForm(false)}><X className="h-4 w-4" /></button></div>
            <div className="legacy-modal-body">
              <div className="legacy-form-grid">
                <div className="legacy-form-group legacy-form-group--full"><label>Title <span className="legacy-required">*</span></label><input value={libraryForm.title} onChange={(event) => { setLibraryForm((current) => ({ ...current, title: event.target.value })); setLibraryErrors((current) => ({ ...current, title: undefined })); }} />{libraryErrors.title ? <p className="legacy-field-error">{libraryErrors.title}</p> : null}</div>
                <div className="legacy-form-group"><label>Audience</label><input value={libraryForm.audience} onChange={(event) => setLibraryForm((current) => ({ ...current, audience: event.target.value }))} /></div>
                <div className="legacy-form-group"><label>Delivery Mode</label><select value={libraryForm.delivery_mode} onChange={(event) => setLibraryForm((current) => ({ ...current, delivery_mode: event.target.value }))}>{["Video", "Workshop", "Document"].map((value) => <option key={value} value={value}>{value}</option>)}</select></div>
                <div className="legacy-form-group legacy-form-group--full"><label>Content URL</label><input value={libraryForm.content_url} onChange={(event) => setLibraryForm((current) => ({ ...current, content_url: event.target.value }))} /></div>
                <div className="legacy-form-group legacy-form-group--full"><label>Status</label><select value={libraryForm.status} onChange={(event) => setLibraryForm((current) => ({ ...current, status: event.target.value }))}>{["Active", "Draft", "Archived"].map((value) => <option key={value} value={value}>{value}</option>)}</select></div>
              </div>
            </div>
            <div className="legacy-modal-footer"><button type="button" className="legacy-secondary-btn" onClick={() => setShowLibraryForm(false)}>Cancel</button><button type="button" className="legacy-primary-btn" onClick={() => void createLibraryItem()}><Save className="h-4 w-4" />Save</button></div>
          </div>
        </div>
      ) : null}

      {showAssignmentForm ? (
        <div className="legacy-modal-overlay">
          <div className="legacy-modal">
            <div className="legacy-modal-header"><h2>Assign Training</h2><button type="button" className="legacy-icon-btn" onClick={() => setShowAssignmentForm(false)}><X className="h-4 w-4" /></button></div>
            <div className="legacy-modal-body">
              <div className="legacy-form-grid">
                <div className="legacy-form-group legacy-form-group--full"><label>Training Item <span className="legacy-required">*</span></label><select value={assignmentForm.training_id} onChange={(event) => { setAssignmentForm((current) => ({ ...current, training_id: event.target.value })); setAssignmentErrors((current) => ({ ...current, training_id: undefined })); }}><option value="">Select training</option>{library.map((item) => <option key={String(item.id)} value={String(item.id)}>{String(item.title ?? "Training")}</option>)}</select>{assignmentErrors.training_id ? <p className="legacy-field-error">{assignmentErrors.training_id}</p> : null}</div>
                <div className="legacy-form-group"><label>Due Date</label><input type="date" value={assignmentForm.due_date} onChange={(event) => setAssignmentForm((current) => ({ ...current, due_date: event.target.value }))} /></div>
                <div className="legacy-form-group"><label>Status</label><select value={assignmentForm.status} onChange={(event) => setAssignmentForm((current) => ({ ...current, status: event.target.value }))}>{["Assigned", "In Progress", "Completed"].map((value) => <option key={value} value={value}>{value}</option>)}</select></div>
                <div className="legacy-form-group legacy-form-group--full"><label>Survey URL</label><input value={assignmentForm.survey_url} onChange={(event) => setAssignmentForm((current) => ({ ...current, survey_url: event.target.value }))} /></div>
                <div className="legacy-form-group legacy-form-group--full"><label>Assigned To <span className="legacy-required">*</span></label><div className="legacy-chip-list">{users.map((option) => { const selected = assignmentForm.assignees.includes(option.fullName); return <button key={option.id} type="button" className={`legacy-filter-btn ${selected ? "is-active" : ""}`} onClick={() => { setAssignmentForm((current) => ({ ...current, assignees: selected ? current.assignees.filter((name) => name !== option.fullName) : [...current.assignees, option.fullName] })); setAssignmentErrors((current) => ({ ...current, assignees: undefined })); }}>{option.fullName}</button>; })}</div>{assignmentErrors.assignees ? <p className="legacy-field-error">{assignmentErrors.assignees}</p> : null}</div>
              </div>
            </div>
            <div className="legacy-modal-footer"><button type="button" className="legacy-secondary-btn" onClick={() => setShowAssignmentForm(false)}>Cancel</button><button type="button" className="legacy-primary-btn" onClick={() => void createAssignment()}><Save className="h-4 w-4" />Create Assignment</button></div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

