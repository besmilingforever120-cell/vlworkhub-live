"use client";

import { useEffect, useMemo, useState } from "react";
import { BookOpen, CheckCircle2, Pencil, PlayCircle, Plus, Save, Search, Shield, Trash2, Video, X } from "lucide-react";
import { useRouter } from "next/navigation";
import type { SessionUser } from "@vlworkhub/types";
import {
  createResource,
  deleteResource,
  getApiErrorMessage,
  getCurrentUser,
  getDepartments,
  getHrAssignments,
  getPlatformUsers,
  getResource,
  updateResource,
  type DepartmentRecord,
  type HrAssignment,
  type HrRecord,
  type PlatformUserRecord
} from "../lib/hr-client";
import {
  buildAssignmentTargetSummary,
  buildAssignmentTokens,
  getAssignmentStatus,
  getCompletedAssignmentIds,
  getCurrentPlatformUser,
  getQuizUrl,
  getVisibleDepartmentNames,
  isAssignmentVisible,
  parseAssigneeTargets,
  type TrainingAssignmentRow,
  type TrainingLibraryRow
} from "../lib/training-helpers";
import { useHrRole } from "../lib/use-hr-role";
import { canCreateForHrRole, formatDate, formatHrRoleLabel, getVisibleHrUserNames } from "../lib/workflow-utils";

type TrainingTab = "training" | "available";
type TrainingLibraryForm = { title: string; videoUrl: string; quizUrl: string };
type TrainingAssignmentForm = { trainingId: string; dueDate: string; allStaff: boolean; userIds: string[]; departmentIds: string[] };
type TrainingValidationErrors = Partial<Record<"title" | "videoUrl" | "trainingId" | "targets", string>>;

function emptyTrainingForm(): TrainingLibraryForm {
  return { title: "", videoUrl: "", quizUrl: "" };
}

function emptyAssignmentForm(): TrainingAssignmentForm {
  return { trainingId: "", dueDate: "", allStaff: false, userIds: [], departmentIds: [] };
}

export function TrainingWorkspace() {
  const router = useRouter();
  const { role: hrRole } = useHrRole();
  const [activeTab, setActiveTab] = useState<TrainingTab>("training");
  const [user, setUser] = useState<SessionUser | null>(null);
  const [users, setUsers] = useState<PlatformUserRecord[]>([]);
  const [departments, setDepartments] = useState<DepartmentRecord[]>([]);
  const [hrAssignments, setHrAssignments] = useState<HrAssignment[]>([]);
  const [library, setLibrary] = useState<TrainingLibraryRow[]>([]);
  const [assignments, setAssignments] = useState<TrainingAssignmentRow[]>([]);
  const [completions, setCompletions] = useState<HrRecord[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showUserPicker, setShowUserPicker] = useState(false);
  const [showDepartmentPicker, setShowDepartmentPicker] = useState(false);
  const [trainingForm, setTrainingForm] = useState<TrainingLibraryForm>(emptyTrainingForm());
  const [assignmentForm, setAssignmentForm] = useState<TrainingAssignmentForm>(emptyAssignmentForm());
  const [validationErrors, setValidationErrors] = useState<TrainingValidationErrors>({});
  const [editingTrainingId, setEditingTrainingId] = useState<number | null>(null);
  const [editingAssignmentId, setEditingAssignmentId] = useState<number | null>(null);
  const [userSearch, setUserSearch] = useState("");
  const [departmentSearch, setDepartmentSearch] = useState("");
  const [draftUserIds, setDraftUserIds] = useState<string[]>([]);
  const [draftDepartmentIds, setDraftDepartmentIds] = useState<string[]>([]);

  const canManage = canCreateForHrRole(hrRole);

  async function load() {
    try {
      setError("");
      const [session, platformUsers, departmentRows, roleRows, trainingRows, assignmentRows, completionRows] = await Promise.all([
        getCurrentUser(),
        getPlatformUsers(),
        getDepartments(),
        getHrAssignments(),
        getResource("training"),
        getResource("training_assignments"),
        getResource("training_completions")
      ]);
      setUser(session);
      setUsers(platformUsers.items || []);
      setDepartments(departmentRows.items || []);
      setHrAssignments(roleRows.items || []);
      setLibrary((trainingRows || []) as TrainingLibraryRow[]);
      setAssignments((assignmentRows || []) as TrainingAssignmentRow[]);
      setCompletions(completionRows || []);
    } catch (loadError) {
      setError(getApiErrorMessage(loadError));
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const currentPlatformUser = useMemo(() => getCurrentPlatformUser(user, users), [user, users]);

  const visibleNames = useMemo(
    () => getVisibleHrUserNames(hrRole, user?.id || "", user?.fullName || "", hrAssignments, users.map((candidate) => ({
      id: candidate.id,
      fullName: candidate.name || candidate.email,
      email: candidate.email,
      roles: [],
      status: "active"
    }))),
    [hrAssignments, hrRole, user?.fullName, user?.id, users]
  );

  const visibleDepartmentNames = useMemo(
    () => getVisibleDepartmentNames(visibleNames, users, currentPlatformUser),
    [currentPlatformUser, users, visibleNames]
  );

  const completedAssignmentIds = useMemo(() => getCompletedAssignmentIds(completions), [completions]);

  const filteredAssignments = useMemo(() => {
    const normalizedQuery = query.toLowerCase();
    return assignments.filter((assignment) => {
      const visible = isAssignmentVisible(assignment, hrRole, user, currentPlatformUser, visibleNames, visibleDepartmentNames);
      if (!visible) return false;
      const training = library.find((item) => Number(item.id) === Number(assignment.training_id));
      const haystack = [assignment.title, assignment.assignee_name, assignment.due_date, assignment.status, training?.training_name]
        .map((value) => String(value ?? "").toLowerCase())
        .join(" ");
      return haystack.includes(normalizedQuery);
    });
  }, [assignments, currentPlatformUser, hrRole, library, query, user, visibleDepartmentNames, visibleNames]);

  const filteredLibrary = useMemo(() => {
    const normalizedQuery = query.toLowerCase();
    return library.filter((training) => {
      const haystack = [training.training_name, training.video_iframe_link, getQuizUrl(training), training.status]
        .map((value) => String(value ?? "").toLowerCase())
        .join(" ");
      return haystack.includes(normalizedQuery);
    });
  }, [library, query]);

  const stats = useMemo(() => ({
    library: library.length,
    assignments: filteredAssignments.length,
    completed: filteredAssignments.filter((assignment) => getAssignmentStatus(assignment, completedAssignmentIds) === "Completed").length,
    active: filteredAssignments.filter((assignment) => getAssignmentStatus(assignment, completedAssignmentIds) === "Assigned").length
  }), [completedAssignmentIds, filteredAssignments, library.length]);

  const selectedUsers = useMemo(() => users.filter((candidate) => assignmentForm.userIds.includes(candidate.id)), [assignmentForm.userIds, users]);
  const selectedDepartments = useMemo(() => departments.filter((candidate) => assignmentForm.departmentIds.includes(candidate.id)), [assignmentForm.departmentIds, departments]);
  const filteredUserOptions = useMemo(() => users.filter((candidate) => `${candidate.name || ""} ${candidate.email || ""}`.toLowerCase().includes(userSearch.toLowerCase())), [userSearch, users]);
  const filteredDepartmentOptions = useMemo(() => departments.filter((candidate) => `${candidate.name || ""} ${candidate.address || ""}`.toLowerCase().includes(departmentSearch.toLowerCase())), [departmentSearch, departments]);

  function resetCreateModal() {
    setShowCreateModal(false);
    setEditingTrainingId(null);
    setTrainingForm(emptyTrainingForm());
    setValidationErrors((current) => ({ ...current, title: undefined, videoUrl: undefined }));
  }

  function resetAssignModal() {
    setShowAssignModal(false);
    setEditingAssignmentId(null);
    setAssignmentForm(emptyAssignmentForm());
    setValidationErrors((current) => ({ ...current, trainingId: undefined, targets: undefined }));
    setShowUserPicker(false);
    setShowDepartmentPicker(false);
    setUserSearch("");
    setDepartmentSearch("");
    setDraftUserIds([]);
    setDraftDepartmentIds([]);
  }

  async function submitTraining() {
    const nextErrors: TrainingValidationErrors = {};
    if (!trainingForm.title.trim()) nextErrors.title = "Training Name is required.";
    if (!trainingForm.videoUrl.trim()) nextErrors.videoUrl = "Video iframe link is required.";
    setValidationErrors((current) => ({ ...current, ...nextErrors }));
    if (Object.keys(nextErrors).length) return;

    const payload = {
      training_name: trainingForm.title.trim(),
      quiz_iframe_link: trainingForm.quizUrl.trim() || "",
      
      video_iframe_link: trainingForm.videoUrl.trim(),
      status: "Active"
    };

    try {
      if (editingTrainingId) {
        await updateResource("training", editingTrainingId, payload);
      } else {
        await createResource("training", payload);
      }
      resetCreateModal();
      await load();
    } catch (submitError) {
      setError(getApiErrorMessage(submitError));
    }
  }

  async function submitAssignment() {
    const nextErrors: TrainingValidationErrors = {};
    if (!assignmentForm.trainingId) nextErrors.trainingId = "Select a training item.";
    if (!assignmentForm.allStaff && assignmentForm.userIds.length === 0 && assignmentForm.departmentIds.length === 0) {
      nextErrors.targets = "Choose All Staff, at least one user, or at least one department.";
    }
    setValidationErrors((current) => ({ ...current, ...nextErrors }));
    if (Object.keys(nextErrors).length) return;

    const selectedTraining = library.find((item) => Number(item.id) === Number(assignmentForm.trainingId));
    const tokens = buildAssignmentTokens(assignmentForm, users, departments);

    try {
      if (editingAssignmentId) {
        const existing = assignments.find((item) => Number(item.id) === editingAssignmentId);
        await updateResource("training_assignments", editingAssignmentId, {
          title: String(selectedTraining?.training_name ?? "Training assignment"),
          training_id: assignmentForm.trainingId,
          assignee_name: tokens.join(", "),
          due_date: assignmentForm.dueDate || "",
          survey_url: getQuizUrl(selectedTraining),
          status: String(existing?.status ?? "Assigned")
        });
      } else {
        await createResource("training_assignments", {
          title: String(selectedTraining?.training_name ?? "Training assignment"),
          training_id: assignmentForm.trainingId,
          assignee_name: tokens.join(", "),
          due_date: assignmentForm.dueDate || "",
          survey_url: getQuizUrl(selectedTraining),
          status: "Assigned"
        });
      }
      resetAssignModal();
      await load();
    } catch (submitError) {
      setError(getApiErrorMessage(submitError));
    }
  }

  function openEditTraining(training: TrainingLibraryRow) {
    setEditingTrainingId(Number(training.id));
    setTrainingForm({
      title: String(training.training_name ?? ""),
      videoUrl: String(training.video_iframe_link ?? ""),
      quizUrl: String(training.quiz_iframe_link ?? "")
    });
    setValidationErrors({});
    setShowCreateModal(true);
  }

  function openEditAssignment(assignment: TrainingAssignmentRow) {
    const parsed = parseAssigneeTargets(assignment.assignee_name, users, departments);
    setAssignmentForm({
      trainingId: String(assignment.training_id ?? ""),
      dueDate: String(assignment.due_date ?? "").slice(0, 10),
      allStaff: parsed.allStaff,
      userIds: parsed.userIds,
      departmentIds: parsed.departmentIds
    });
    setEditingAssignmentId(Number(assignment.id));
    setValidationErrors({});
    setShowAssignModal(true);
  }

  async function handleDeleteTraining(training: TrainingLibraryRow) {
    if (!window.confirm("Are you sure you want to delete this training?")) return;
    try {
      await deleteResource("training", Number(training.id));
      await load();
    } catch (deleteError) {
      setError(getApiErrorMessage(deleteError));
    }
  }

  async function handleDeleteAssignment(assignment: TrainingAssignmentRow) {
    if (!window.confirm("Are you sure you want to delete this training assignment?")) return;
    try {
      await deleteResource("training_assignments", Number(assignment.id));
      await load();
    } catch (deleteError) {
      setError(getApiErrorMessage(deleteError));
    }
  }

  async function handleArchiveAssignment(assignment: TrainingAssignmentRow) {
    try {
      await updateResource("training_assignments", Number(assignment.id), {
        title: String(assignment.title ?? "Training assignment"),
        training_id: String(assignment.training_id ?? ""),
        assignee_name: String(assignment.assignee_name ?? ""),
        due_date: String(assignment.due_date ?? ""),
        survey_url: String(assignment.survey_url ?? ""),
        status: "Archived"
      });
      await load();
    } catch (archiveError) {
      setError(getApiErrorMessage(archiveError));
    }
  }

  function openUserPicker() {
    setDraftUserIds(assignmentForm.userIds);
    setUserSearch("");
    setShowUserPicker(true);
  }

  function openDepartmentPicker() {
    setDraftDepartmentIds(assignmentForm.departmentIds);
    setDepartmentSearch("");
    setShowDepartmentPicker(true);
  }

  return (
    <div className="legacy-portal">
      {error ? <div className="hr-card" style={{ marginBottom: 20, color: "#b91c1c", borderColor: "#fecaca", background: "#fff1f2" }}>{error}</div> : null}

      <div className="legacy-header">
        <div>
          <h1 className="legacy-header__title">Training</h1>
          <p className="legacy-header__subtitle">Create training items, assign them quickly, and track active training rows in one clean list.</p>
          <div className="legacy-role"><Shield className="h-4 w-4" />HR Role: {formatHrRoleLabel(hrRole)}</div>
        </div>
        {canManage ? (
          <div className="legacy-actions-row">
            <button type="button" className="legacy-secondary-btn" onClick={() => setShowCreateModal(true)}><Video className="h-4 w-4" />Create Training</button>
            <button type="button" className="legacy-primary-btn" onClick={() => setShowAssignModal(true)}><Plus className="h-4 w-4" />Assign Training</button>
          </div>
        ) : null}
      </div>

      <section className="legacy-stats-grid">
        {[
          { label: "Library Items", value: stats.library, icon: BookOpen, color: "blue" },
          { label: "Visible Assignments", value: stats.assignments, icon: Save, color: "amber" },
          { label: "Completed", value: stats.completed, icon: CheckCircle2, color: "green" },
          { label: "Active", value: stats.active, icon: PlayCircle, color: "red" }
        ].map((stat) => (
          <div key={stat.label} className={`legacy-stat-card ${stat.color}`}>
            <div className="legacy-stat-icon"><stat.icon className="h-5 w-5" /></div>
            <div><p className="legacy-stat-value">{stat.value}</p><p className="legacy-stat-title">{stat.label}</p></div>
          </div>
        ))}
      </section>

      <section className="legacy-toolbar">
        <div className="legacy-toolbar__row">
          <div className="legacy-search"><Search className="h-4 w-4" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search training..." /></div>
        </div>
      </section>

      <div className="legacy-tabs">
        <button type="button" className={`legacy-tab-btn ${activeTab === "training" ? "is-active" : ""}`} onClick={() => setActiveTab("training")}>Training</button>
        <button type="button" className={`legacy-tab-btn ${activeTab === "available" ? "is-active" : ""}`} onClick={() => setActiveTab("available")}>Available Trainings</button>
      </div>

      {activeTab === "training" ? (
        <div className="legacy-panel">
          <div className="legacy-panel-header"><div><h2>Training</h2><p>All visible training assignments appear here in one simple list.</p></div></div>
          <div className="legacy-panel-body">
            {filteredAssignments.length ? (
              <table className="legacy-table">
                <thead>
                  <tr>
                    <th>Training Name</th>
                    <th>Assigned To</th>
                    <th>Due Date</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAssignments.map((assignment) => {
                    const status = getAssignmentStatus(assignment, completedAssignmentIds);
                    const canArchive = status === "Completed";
                    const showAdminActions = canManage && status === "Assigned";
                    return (
                      <tr key={String(assignment.id)} className="cursor-pointer" onClick={() => router.push(`/training/${assignment.training_id}`)}>
                        <td>
                          <div className="legacy-table-title">{String(assignment.title ?? "Training")}</div>
                          <div className="legacy-table-subtitle">{library.find((item) => Number(item.id) === Number(assignment.training_id))?.video_iframe_link ? "Video iframe configured" : "No video link"}</div>
                        </td>
                        <td>{buildAssignmentTargetSummary(assignment)}</td>
                        <td>{formatDate(assignment.due_date)}</td>
                        <td><span className={`legacy-status ${status === "Completed" ? "completed" : status === "Archived" ? "archived" : "default"}`}>{status}</span></td>
                        <td>
                          <div className="flex items-center gap-2">
                            {showAdminActions ? (
                              <>
                                <button type="button" className="legacy-icon-btn" onClick={(event) => { event.stopPropagation(); openEditAssignment(assignment); }}><Pencil className="h-4 w-4" /></button>
                                <button type="button" className="legacy-icon-btn" onClick={(event) => { event.stopPropagation(); void handleDeleteAssignment(assignment); }}><Trash2 className="h-4 w-4" /></button>
                              </>
                            ) : null}
                            {canArchive ? <button type="button" className="legacy-secondary-btn" onClick={(event) => { event.stopPropagation(); void handleArchiveAssignment(assignment); }}>Archive</button> : null}
                            {!showAdminActions && !canArchive ? <span className="text-slate-400">-</span> : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : <div className="legacy-empty">No training records are visible in the current view.</div>}
          </div>
        </div>
      ) : (
        <div className="legacy-panel">
          <div className="legacy-panel-header"><div><h2>Available Trainings</h2><p>Training definitions only. Manage the library here.</p></div></div>
          <div className="legacy-panel-body">
            {filteredLibrary.length ? (
              <table className="legacy-table">
                <thead>
                  <tr>
                    <th>Training Name</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLibrary.map((training) => (
                    <tr key={String(training.id)}>
                      <td>
                        <div className="legacy-table-title">{String(training.training_name ?? "Training")}</div>
                        <div className="legacy-table-subtitle">{String(training.video_iframe_link ?? "").trim() ? "Video iframe configured" : "No video link"}</div>
                      </td>
                      <td>
                        <div className="flex items-center gap-2">
                          <button type="button" className="legacy-icon-btn" onClick={() => openEditTraining(training)}><Pencil className="h-4 w-4" /></button>
                          <button type="button" className="legacy-icon-btn" onClick={() => void handleDeleteTraining(training)}><Trash2 className="h-4 w-4" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <div className="legacy-empty">No trainings have been created yet.</div>}
          </div>
        </div>
      )}

      {showCreateModal ? (
        <div className="legacy-modal-overlay">
          <div className="legacy-modal">
            <div className="legacy-modal-header"><h2>{editingTrainingId ? "Edit Training" : "Create Training"}</h2><button type="button" className="legacy-icon-btn" onClick={resetCreateModal}><X className="h-4 w-4" /></button></div>
            <div className="legacy-modal-body">
              <div className="legacy-form-grid">
                <div className="legacy-form-group legacy-form-group--full"><label>Training Name <span className="legacy-required">*</span></label><input value={trainingForm.title} onChange={(event) => setTrainingForm((current) => ({ ...current, title: event.target.value }))} />{validationErrors.title ? <p className="legacy-field-error">{validationErrors.title}</p> : null}</div>
                <div className="legacy-form-group legacy-form-group--full"><label>Video iframe link <span className="legacy-required">*</span></label><input value={trainingForm.videoUrl} onChange={(event) => setTrainingForm((current) => ({ ...current, videoUrl: event.target.value }))} />{validationErrors.videoUrl ? <p className="legacy-field-error">{validationErrors.videoUrl}</p> : null}</div>
                <div className="legacy-form-group legacy-form-group--full"><label>Microsoft Forms quiz iframe link</label><input value={trainingForm.quizUrl} onChange={(event) => setTrainingForm((current) => ({ ...current, quizUrl: event.target.value }))} /></div>
              </div>
            </div>
            <div className="legacy-modal-footer"><button type="button" className="legacy-secondary-btn" onClick={resetCreateModal}>Cancel</button><button type="button" className="legacy-primary-btn" onClick={() => void submitTraining()}><Save className="h-4 w-4" />{editingTrainingId ? "Update" : "Create"}</button></div>
          </div>
        </div>
      ) : null}

      {showAssignModal ? (
        <div className="legacy-modal-overlay">
          <div className="legacy-modal legacy-modal--wide">
            <div className="legacy-modal-header"><h2>{editingAssignmentId ? "Edit Training Assignment" : "Assign Training"}</h2><button type="button" className="legacy-icon-btn" onClick={resetAssignModal}><X className="h-4 w-4" /></button></div>
            <div className="legacy-modal-body">
              <div className="legacy-form-grid">
                <div className="legacy-form-group legacy-form-group--full"><label>Select Training <span className="legacy-required">*</span></label><select value={assignmentForm.trainingId} onChange={(event) => setAssignmentForm((current) => ({ ...current, trainingId: event.target.value }))}><option value="">Select training</option>{library.map((item) => <option key={String(item.id)} value={String(item.id)}>{String(item.training_name ?? "Training")}</option>)}</select>{validationErrors.trainingId ? <p className="legacy-field-error">{validationErrors.trainingId}</p> : null}</div>
                <div className="legacy-form-group"><label>Due Date</label><input type="date" value={assignmentForm.dueDate} onChange={(event) => setAssignmentForm((current) => ({ ...current, dueDate: event.target.value }))} /></div>
                <div className="legacy-form-group legacy-form-group--full"><div className="legacy-form-section"><div className="legacy-form-section__header"><h3>Assignment</h3><p>Choose who should receive this training.</p></div><div className="legacy-form-section__body"><label className={`legacy-checkbox-row ${assignmentForm.allStaff ? "is-active" : ""}`}><input type="checkbox" checked={assignmentForm.allStaff} onChange={(event) => setAssignmentForm((current) => ({ ...current, allStaff: event.target.checked, userIds: event.target.checked ? [] : current.userIds, departmentIds: event.target.checked ? [] : current.departmentIds }))} /><span>All Staff</span></label><div className="legacy-picker-row"><div><label className="legacy-picker-label">Users</label><div className="legacy-chip-list legacy-chip-list--compact">{selectedUsers.length ? selectedUsers.map((candidate) => <span key={candidate.id} className="legacy-selection-tag">{candidate.name || candidate.email}<button type="button" onClick={() => setAssignmentForm((current) => ({ ...current, userIds: current.userIds.filter((value) => value !== candidate.id) }))} disabled={assignmentForm.allStaff}><X className="h-3 w-3" /></button></span>) : <span className="legacy-selection-empty">No users selected.</span>}</div></div><button type="button" className="legacy-secondary-btn" onClick={openUserPicker} disabled={assignmentForm.allStaff}><Plus className="h-4 w-4" />Add Users</button></div><div className="legacy-picker-row"><div><label className="legacy-picker-label">Departments</label><div className="legacy-chip-list legacy-chip-list--compact">{selectedDepartments.length ? selectedDepartments.map((candidate) => <span key={candidate.id} className="legacy-selection-tag">{candidate.name}<button type="button" onClick={() => setAssignmentForm((current) => ({ ...current, departmentIds: current.departmentIds.filter((value) => value !== candidate.id) }))} disabled={assignmentForm.allStaff}><X className="h-3 w-3" /></button></span>) : <span className="legacy-selection-empty">No departments selected.</span>}</div></div><button type="button" className="legacy-secondary-btn" onClick={openDepartmentPicker} disabled={assignmentForm.allStaff}><Plus className="h-4 w-4" />Add Departments</button></div>{validationErrors.targets ? <p className="legacy-field-error">{validationErrors.targets}</p> : null}</div></div></div>
              </div>
            </div>
            <div className="legacy-modal-footer"><button type="button" className="legacy-secondary-btn" onClick={resetAssignModal}>Cancel</button><button type="button" className="legacy-primary-btn" onClick={() => void submitAssignment()}><Save className="h-4 w-4" />{editingAssignmentId ? "Update" : "Assign"}</button></div>
          </div>
        </div>
      ) : null}

      {showUserPicker ? (
        <div className="legacy-modal-overlay"><div className="legacy-modal" style={{ maxWidth: 680 }}><div className="legacy-modal-header"><h2>Add Users</h2><button type="button" className="legacy-icon-btn" onClick={() => setShowUserPicker(false)}><X className="h-4 w-4" /></button></div><div className="legacy-modal-body"><div className="legacy-search" style={{ marginBottom: 16 }}><Search className="h-4 w-4" /><input value={userSearch} onChange={(event) => setUserSearch(event.target.value)} placeholder="Search users..." /></div><div className="legacy-chip-list legacy-chip-list--compact" style={{ marginBottom: 16 }}>{draftUserIds.length ? draftUserIds.map((userId) => { const candidate = users.find((option) => option.id === userId); if (!candidate) return null; return <span key={userId} className="legacy-selection-tag">{candidate.name || candidate.email}<button type="button" onClick={() => setDraftUserIds((current) => current.filter((value) => value !== userId))}><X className="h-3 w-3" /></button></span>; }) : <span className="legacy-selection-empty">No users selected yet.</span>}</div><div className="legacy-picker-list">{filteredUserOptions.map((candidate) => { const selected = draftUserIds.includes(candidate.id); return <button key={candidate.id} type="button" className={`legacy-picker-item ${selected ? "is-active" : ""}`} onClick={() => setDraftUserIds((current) => selected ? current.filter((value) => value !== candidate.id) : [...current, candidate.id])}><div><strong>{candidate.name || candidate.email}</strong><div>{candidate.email}</div></div><span>{selected ? "Selected" : "Add"}</span></button>; })}</div></div><div className="legacy-modal-footer"><button type="button" className="legacy-secondary-btn" onClick={() => setShowUserPicker(false)}>Cancel</button><button type="button" className="legacy-primary-btn" onClick={() => { setAssignmentForm((current) => ({ ...current, userIds: draftUserIds })); setShowUserPicker(false); }}>Save Users</button></div></div></div>
      ) : null}

      {showDepartmentPicker ? (
        <div className="legacy-modal-overlay"><div className="legacy-modal" style={{ maxWidth: 680 }}><div className="legacy-modal-header"><h2>Add Departments</h2><button type="button" className="legacy-icon-btn" onClick={() => setShowDepartmentPicker(false)}><X className="h-4 w-4" /></button></div><div className="legacy-modal-body"><div className="legacy-search" style={{ marginBottom: 16 }}><Search className="h-4 w-4" /><input value={departmentSearch} onChange={(event) => setDepartmentSearch(event.target.value)} placeholder="Search departments..." /></div><div className="legacy-chip-list legacy-chip-list--compact" style={{ marginBottom: 16 }}>{draftDepartmentIds.length ? draftDepartmentIds.map((departmentId) => { const candidate = departments.find((option) => option.id === departmentId); if (!candidate) return null; return <span key={departmentId} className="legacy-selection-tag">{candidate.name}<button type="button" onClick={() => setDraftDepartmentIds((current) => current.filter((value) => value !== departmentId))}><X className="h-3 w-3" /></button></span>; }) : <span className="legacy-selection-empty">No departments selected yet.</span>}</div><div className="legacy-picker-list">{filteredDepartmentOptions.map((candidate) => { const selected = draftDepartmentIds.includes(candidate.id); return <button key={candidate.id} type="button" className={`legacy-picker-item ${selected ? "is-active" : ""}`} onClick={() => setDraftDepartmentIds((current) => selected ? current.filter((value) => value !== candidate.id) : [...current, candidate.id])}><div><strong>{candidate.name}</strong><div>{candidate.address || "No address"}</div></div><span>{selected ? "Selected" : "Add"}</span></button>; })}</div></div><div className="legacy-modal-footer"><button type="button" className="legacy-secondary-btn" onClick={() => setShowDepartmentPicker(false)}>Cancel</button><button type="button" className="legacy-primary-btn" onClick={() => { setAssignmentForm((current) => ({ ...current, departmentIds: draftDepartmentIds })); setShowDepartmentPicker(false); }}>Save Departments</button></div></div></div>
      ) : null}
    </div>
  );
}

