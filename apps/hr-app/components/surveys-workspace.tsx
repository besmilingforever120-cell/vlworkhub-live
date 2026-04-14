"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ClipboardList, Pencil, PlayCircle, Plus, Save, Search, Shield, Trash2, X } from "lucide-react";
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
import { useHrRole } from "../lib/use-hr-role";
import { canCreateForHrRole, formatDate, formatHrRoleLabel, getVisibleHrUserNames, splitAssignees } from "../lib/workflow-utils";
import { buildAssignmentTargetSummary, buildAssignmentTokens, parseAssigneeTargets } from "../lib/training-helpers";

type SurveyTab = "surveys" | "available";
type SurveyLibraryForm = { title: string; url: string };
type SurveyAssignmentForm = { surveyId: string; dueDate: string; allStaff: boolean; userIds: string[]; departmentIds: string[] };
type SurveyValidationErrors = Partial<Record<"title" | "url" | "surveyId" | "targets", string>>;

type SurveyLibraryRow = HrRecord & {
  id: number;
  title?: string | number | null;
  url?: string | number | null;
  status?: string | number | null;
};

type SurveyAssignmentRow = HrRecord & {
  id: number;
  survey_id?: string | number | null;
  title?: string | number | null;
  assignee_name?: string | number | null;
  user_id?: string | number | null;
  department_id?: string | number | null;
  all_staff?: string | number | boolean | null;
  user_name?: string | number | null;
  department_name?: string | number | null;
  due_date?: string | number | null;
  status?: string | number | null;
};

function emptySurveyForm(): SurveyLibraryForm {
  return { title: "", url: "" };
}

function emptyAssignmentForm(): SurveyAssignmentForm {
  return { surveyId: "", dueDate: "", allStaff: false, userIds: [], departmentIds: [] };
}

function normalizeName(value: string | number | null | undefined) {
  return String(value ?? "").trim().toLowerCase();
}

function getCompletionUsersByAssignment(completions: HrRecord[]) {
  const byAssignment = new Map<string, Set<string>>();
  for (const item of completions) {
    const assignmentId = String(item.assignment_id ?? "").trim();
    const completedOn = String(item.completed_on ?? "").trim();
    const userName = normalizeName(item.user_name);
    if (!assignmentId || !completedOn || !userName) continue;

    const users = byAssignment.get(assignmentId) || new Set<string>();
    users.add(userName);
    byAssignment.set(assignmentId, users);
  }
  return byAssignment;
}

function resolveAssignmentTargetNames(assignment: SurveyAssignmentRow, users: PlatformUserRecord[]) {
  const tokens = splitAssignees(assignment.assignee_name);
  const names = new Set<string>();

  if (tokens.includes("All Staff")) {
    users.forEach((candidate) => {
      const normalized = normalizeName(candidate.name || candidate.email);
      if (normalized) names.add(normalized);
    });
  }

  for (const token of tokens) {
    if (!token || token === "All Staff") continue;

    if (token.startsWith("Department: ")) {
      const departmentName = token.replace("Department: ", "").trim();
      users.forEach((candidate) => {
        if (String(candidate.department_name || "").trim() === departmentName) {
          const normalized = normalizeName(candidate.name || candidate.email);
          if (normalized) names.add(normalized);
        }
      });
      continue;
    }

    names.add(normalizeName(token));
  }

  return names;
}

function getSurveyAssignmentStatusForViewer(
  assignment: SurveyAssignmentRow,
  hrRole: "admin" | "manager" | "employee",
  currentUser: SessionUser | null,
  visibleNames: string[],
  users: PlatformUserRecord[],
  completionUsersByAssignment: Map<string, Set<string>>
) {
  if (String(assignment.status ?? "").trim().toLowerCase() === "archived") return "Archived";

  const assignmentId = String(assignment.id);
  const targetNames = resolveAssignmentTargetNames(assignment, users);
  const completedUsers = completionUsersByAssignment.get(assignmentId) || new Set<string>();

  if (!targetNames.size) return String(assignment.status ?? "Assigned") || "Assigned";

  if (hrRole === "employee") {
    const currentName = normalizeName(currentUser?.fullName || "");
    return currentName && completedUsers.has(currentName) ? "Completed" : "Assigned";
  }

  if (hrRole === "manager") {
    const visible = new Set(visibleNames.map((name) => normalizeName(name)).filter(Boolean));
    const managedTargets = Array.from(targetNames).filter((name) => visible.has(name));
    if (!managedTargets.length) return "Assigned";
    return managedTargets.every((name) => completedUsers.has(name)) ? "Completed" : "Assigned";
  }

  return Array.from(targetNames).every((name) => completedUsers.has(name)) ? "Completed" : "Assigned";
}

function isSurveyAssignmentVisibleForList(
  assignment: SurveyAssignmentRow,
  hrRole: "admin" | "manager" | "employee",
  currentUser: SessionUser | null,
  visibleNames: string[],
  users: PlatformUserRecord[],
  completionUsersByAssignment: Map<string, Set<string>>
) {
  const tokens = splitAssignees(assignment.assignee_name);
  const currentName = String(currentUser?.fullName || "").trim();

  const visibleByAudience = hrRole === "admin"
    || tokens.includes("All Staff")
    || (currentName && tokens.includes(currentName))
    || (hrRole === "manager" && tokens.some((token) => visibleNames.includes(token)));

  if (!visibleByAudience) return false;

  if (String(assignment.status ?? "").trim().toLowerCase() === "archived") {
    return hrRole === "admin";
  }

  const assignmentId = String(assignment.id);
  const targetNames = resolveAssignmentTargetNames(assignment, users);
  const completedUsers = completionUsersByAssignment.get(assignmentId) || new Set<string>();

  if (!targetNames.size) return true;

  if (hrRole === "employee") {
    const mine = normalizeName(currentName);
    if (!mine || !targetNames.has(mine)) return false;
    return !completedUsers.has(mine);
  }

  if (hrRole === "manager") {
    const visible = new Set(visibleNames.map((name) => normalizeName(name)).filter(Boolean));
    const managedTargets = Array.from(targetNames).filter((name) => visible.has(name));
    if (!managedTargets.length) return false;
    return managedTargets.some((name) => !completedUsers.has(name));
  }

  return true;
}

export function SurveysWorkspace() {
  const router = useRouter();
  const { role: hrRole } = useHrRole();
  const [activeTab, setActiveTab] = useState<SurveyTab>("surveys");
  const [user, setUser] = useState<SessionUser | null>(null);
  const [users, setUsers] = useState<PlatformUserRecord[]>([]);
  const [departments, setDepartments] = useState<DepartmentRecord[]>([]);
  const [hrAssignments, setHrAssignments] = useState<HrAssignment[]>([]);
  const [library, setLibrary] = useState<SurveyLibraryRow[]>([]);
  const [assignments, setAssignments] = useState<SurveyAssignmentRow[]>([]);
  const [completions, setCompletions] = useState<HrRecord[]>([]);
  const [query, setQuery] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showUserPicker, setShowUserPicker] = useState(false);
  const [showDepartmentPicker, setShowDepartmentPicker] = useState(false);
  const [surveyForm, setSurveyForm] = useState<SurveyLibraryForm>(emptySurveyForm());
  const [assignmentForm, setAssignmentForm] = useState<SurveyAssignmentForm>(emptyAssignmentForm());
  const [validationErrors, setValidationErrors] = useState<SurveyValidationErrors>({});
  const [editingSurveyId, setEditingSurveyId] = useState<number | null>(null);
  const [editingAssignmentId, setEditingAssignmentId] = useState<number | null>(null);
  const [userSearch, setUserSearch] = useState("");
  const [departmentSearch, setDepartmentSearch] = useState("");
  const [draftUserIds, setDraftUserIds] = useState<string[]>([]);
  const [draftDepartmentIds, setDraftDepartmentIds] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [openedAssignments, setOpenedAssignments] = useState<Set<string>>(new Set());

  const canManage = canCreateForHrRole(hrRole);

  async function load() {
    try {
      setError("");
      const [session, platformUsers, departmentRows, roleRows, surveyData, assignmentData, completionData] = await Promise.all([
        getCurrentUser(),
        getPlatformUsers(),
        getDepartments(),
        getHrAssignments(),
        getResource("surveys"),
        getResource("survey_assignments"),
        getResource("survey_completions")
      ]);

      setUser(session);
      setUsers(platformUsers.items || []);
      setDepartments(departmentRows.items || []);
      setHrAssignments(roleRows.items || []);
      setLibrary((surveyData || []) as SurveyLibraryRow[]);
      setAssignments((assignmentData || []) as SurveyAssignmentRow[]);
      setCompletions(completionData || []);
    } catch (loadError) {
      setError(getApiErrorMessage(loadError));
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    try {
      const raw = window.localStorage.getItem(`vlworkhub-survey-opened-${user.id}`);
      const parsed = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) {
        setOpenedAssignments(new Set(parsed.map((item) => String(item))));
      }
    } catch {
      setOpenedAssignments(new Set());
    }
  }, [user?.id]);

  function markSurveyOpened(assignmentId: string) {
    setOpenedAssignments((current) => {
      if (current.has(assignmentId)) return current;
      const next = new Set(current);
      next.add(assignmentId);

      if (user?.id) {
        window.localStorage.setItem(`vlworkhub-survey-opened-${user.id}`, JSON.stringify(Array.from(next)));
      }

      return next;
    });
  }

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

  const completionUsersByAssignment = useMemo(() => getCompletionUsersByAssignment(completions), [completions]);

  const filteredAssignments = useMemo(() => {
    const normalizedQuery = query.toLowerCase();
    return assignments.filter((assignment) => {
      const visible = isSurveyAssignmentVisibleForList(
        assignment,
        hrRole,
        user,
        visibleNames,
        users,
        completionUsersByAssignment
      );
      if (!visible) return false;
      if (hrRole === "admin" && String(assignment.status ?? "").trim().toLowerCase() === "archived") return false;

      const survey = library.find((item) => Number(item.id) === Number(assignment.survey_id));
      const haystack = [assignment.title, assignment.assignee_name, assignment.due_date, assignment.status, survey?.title]
        .map((value) => String(value ?? "").toLowerCase())
        .join(" ");
      return haystack.includes(normalizedQuery);
    });
  }, [assignments, completionUsersByAssignment, hrRole, library, query, user, users, visibleNames]);

  const filteredLibrary = useMemo(() => {
    const normalizedQuery = query.toLowerCase();
    return library.filter((survey) => {
      const haystack = [survey.title, survey.url, survey.status].map((value) => String(value ?? "").toLowerCase()).join(" ");
      return haystack.includes(normalizedQuery);
    });
  }, [library, query]);

  const stats = useMemo(() => ({
    library: library.length,
    assignments: filteredAssignments.length,
    completed: filteredAssignments.filter((assignment) => getSurveyAssignmentStatusForViewer(assignment, hrRole, user, visibleNames, users, completionUsersByAssignment) === "Completed").length,
    active: filteredAssignments.filter((assignment) => getSurveyAssignmentStatusForViewer(assignment, hrRole, user, visibleNames, users, completionUsersByAssignment) === "Assigned").length
  }), [completionUsersByAssignment, filteredAssignments, hrRole, library.length, user, users, visibleNames]);

  const selectedUsers = useMemo(() => users.filter((candidate) => assignmentForm.userIds.includes(candidate.id)), [assignmentForm.userIds, users]);
  const selectedDepartments = useMemo(() => departments.filter((candidate) => assignmentForm.departmentIds.includes(candidate.id)), [assignmentForm.departmentIds, departments]);
  const filteredUserOptions = useMemo(() => users.filter((candidate) => `${candidate.name || ""} ${candidate.email || ""}`.toLowerCase().includes(userSearch.toLowerCase())), [userSearch, users]);
  const filteredDepartmentOptions = useMemo(() => departments.filter((candidate) => `${candidate.name || ""} ${candidate.address || ""}`.toLowerCase().includes(departmentSearch.toLowerCase())), [departmentSearch, departments]);

  function resetCreateModal() {
    setShowCreateModal(false);
    setEditingSurveyId(null);
    setSurveyForm(emptySurveyForm());
    setValidationErrors((current) => ({ ...current, title: undefined, url: undefined }));
  }

  function resetAssignModal() {
    setShowAssignModal(false);
    setEditingAssignmentId(null);
    setAssignmentForm(emptyAssignmentForm());
    setValidationErrors((current) => ({ ...current, surveyId: undefined, targets: undefined }));
    setShowUserPicker(false);
    setShowDepartmentPicker(false);
    setUserSearch("");
    setDepartmentSearch("");
    setDraftUserIds([]);
    setDraftDepartmentIds([]);
  }

  async function submitSurvey() {
    const nextErrors: SurveyValidationErrors = {};
    if (!surveyForm.title.trim()) nextErrors.title = "Survey Name is required.";
    if (!surveyForm.url.trim()) nextErrors.url = "Microsoft Forms survey iframe link is required.";
    setValidationErrors((current) => ({ ...current, ...nextErrors }));
    if (Object.keys(nextErrors).length) return;

    const payload = {
      title: surveyForm.title.trim(),
      url: surveyForm.url.trim(),
      due_date: "",
      status: "Active"
    };

    try {
      if (editingSurveyId) {
        await updateResource("surveys", editingSurveyId, payload);
      } else {
        await createResource("surveys", payload);
      }
      resetCreateModal();
      await load();
    } catch (submitError) {
      setError(getApiErrorMessage(submitError));
    }
  }

  async function submitAssignment() {
    const nextErrors: SurveyValidationErrors = {};
    if (!assignmentForm.surveyId) nextErrors.surveyId = "Select a survey item.";
    if (!assignmentForm.allStaff && assignmentForm.userIds.length === 0 && assignmentForm.departmentIds.length === 0) {
      nextErrors.targets = "Choose All Staff, at least one user, or at least one department.";
    }
    setValidationErrors((current) => ({ ...current, ...nextErrors }));
    if (Object.keys(nextErrors).length) return;

    const selectedSurvey = library.find((item) => Number(item.id) === Number(assignmentForm.surveyId));

    try {
      if (editingAssignmentId) {
        const existing = assignments.find((item) => Number(item.id) === editingAssignmentId);
        const userId = assignmentForm.allStaff ? null : (assignmentForm.userIds[0] || null);
        const departmentId = assignmentForm.allStaff ? null : (assignmentForm.departmentIds[0] || null);
        await updateResource("survey_assignments", editingAssignmentId, {
          title: String(selectedSurvey?.title ?? "Survey assignment"),
          survey_id: assignmentForm.surveyId,
          due_date: assignmentForm.dueDate || "",
          status: String(existing?.status ?? "Assigned"),
          user_id: userId,
          department_id: departmentId,
          all_staff: assignmentForm.allStaff ? "true" : "false"
        });
      } else {
        const basePayload = {
          title: String(selectedSurvey?.title ?? "Survey assignment"),
          survey_id: assignmentForm.surveyId,
          due_date: assignmentForm.dueDate || "",
          status: "Assigned"
        };

        const requests: Array<Promise<{ id: number }>> = [];
        if (assignmentForm.allStaff) {
          requests.push(createResource("survey_assignments", {
            ...basePayload,
            user_id: null,
            department_id: null,
            all_staff: "true"
          }));
        } else {
          assignmentForm.userIds.forEach((userId) => {
            requests.push(createResource("survey_assignments", {
              ...basePayload,
              user_id: userId,
              department_id: null,
              all_staff: "false"
            }));
          });

          assignmentForm.departmentIds.forEach((departmentId) => {
            requests.push(createResource("survey_assignments", {
              ...basePayload,
              user_id: null,
              department_id: departmentId,
              all_staff: "false"
            }));
          });
        }

        await Promise.all(requests);
      }
      resetAssignModal();
      await load();
    } catch (submitError) {
      setError(getApiErrorMessage(submitError));
    }
  }

  function openEditSurvey(survey: SurveyLibraryRow) {
    setEditingSurveyId(Number(survey.id));
    setSurveyForm({
      title: String(survey.title ?? ""),
      url: String(survey.url ?? "")
    });
    setValidationErrors({});
    setShowCreateModal(true);
  }

  function openEditAssignment(assignment: SurveyAssignmentRow) {
    const parsed = parseAssigneeTargets(assignment.assignee_name, users, departments);
    const allStaff = String(assignment.all_staff ?? "").toLowerCase() === "true";
    const assignmentUserId = assignment.user_id ? String(assignment.user_id) : "";
    const assignmentDepartmentId = assignment.department_id ? String(assignment.department_id) : "";
    setAssignmentForm({
      surveyId: String(assignment.survey_id ?? ""),
      dueDate: String(assignment.due_date ?? "").slice(0, 10),
      allStaff,
      userIds: allStaff ? [] : (assignmentUserId ? [assignmentUserId] : parsed.userIds),
      departmentIds: allStaff ? [] : (assignmentDepartmentId ? [assignmentDepartmentId] : parsed.departmentIds)
    });
    setEditingAssignmentId(Number(assignment.id));
    setValidationErrors({});
    setShowAssignModal(true);
  }

  async function handleDeleteSurvey(survey: SurveyLibraryRow) {
    if (!window.confirm("Are you sure you want to delete this survey?")) return;
    try {
      await deleteResource("surveys", Number(survey.id));
      await load();
    } catch (deleteError) {
      setError(getApiErrorMessage(deleteError));
    }
  }

  async function handleDeleteAssignment(assignment: SurveyAssignmentRow) {
    if (!window.confirm("Are you sure you want to delete this survey assignment?")) return;
    try {
      await deleteResource("survey_assignments", Number(assignment.id));
      await load();
    } catch (deleteError) {
      setError(getApiErrorMessage(deleteError));
    }
  }

  async function handleArchiveAssignment(assignment: SurveyAssignmentRow) {
    try {
      await updateResource("survey_assignments", Number(assignment.id), {
        title: String(assignment.title ?? "Survey assignment"),
        survey_id: String(assignment.survey_id ?? ""),
        due_date: String(assignment.due_date ?? ""),
        status: "Archived",
        user_id: assignment.user_id ? String(assignment.user_id) : null,
        department_id: assignment.department_id ? String(assignment.department_id) : null,
        all_staff: String(assignment.all_staff ?? "").toLowerCase() === "true" ? "true" : "false"
      });
      await load();
    } catch (archiveError) {
      setError(getApiErrorMessage(archiveError));
    }
  }

  async function markComplete(assignment: SurveyAssignmentRow) {
    if (!user) return;

    const assignmentId = String(assignment.id);
    const existing = completions.find((item) => String(item.assignment_id ?? "") === assignmentId && String(item.user_id ?? "") === user.id);
    const payload = {
      assignment_id: assignmentId,
      user_id: user.id,
      completed_on: new Date().toISOString()
    };

    try {
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

  function isCurrentUserTargeted(assignment: SurveyAssignmentRow) {
    const targetNames = resolveAssignmentTargetNames(assignment, users);
    const currentName = normalizeName(user?.fullName || "");
    return Boolean(currentName && targetNames.has(currentName));
  }

  return (
    <div className="legacy-portal">
      {error ? <div className="hr-card" style={{ marginBottom: 20, color: "#b91c1c", borderColor: "#fecaca", background: "#fff1f2" }}>{error}</div> : null}

      <div className="legacy-header">
        <div>
          <h1 className="legacy-header__title">Surveys</h1>
          <p className="legacy-header__subtitle">Create survey items, assign them quickly, and track active survey rows in one clean list.</p>
          <div className="legacy-role"><Shield className="h-4 w-4" />HR Role: {formatHrRoleLabel(hrRole)}</div>
        </div>
        {canManage ? (
          <div className="legacy-actions-row">
            <button type="button" className="legacy-secondary-btn" onClick={() => setShowCreateModal(true)}><ClipboardList className="h-4 w-4" />Create Survey</button>
            <button type="button" className="legacy-primary-btn" onClick={() => setShowAssignModal(true)}><Plus className="h-4 w-4" />Assgin Survey</button>
          </div>
        ) : null}
      </div>

      <section className="legacy-stats-grid">
        {[
          { label: "Library Items", value: stats.library, icon: ClipboardList, color: "blue" },
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
          <div className="legacy-search"><Search className="h-4 w-4" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search surveys..." /></div>
        </div>
      </section>

      <div className="legacy-tabs">
        <button type="button" className={`legacy-tab-btn ${activeTab === "surveys" ? "is-active" : ""}`} onClick={() => setActiveTab("surveys")}>Surveys</button>
        <button type="button" className={`legacy-tab-btn ${activeTab === "available" ? "is-active" : ""}`} onClick={() => setActiveTab("available")}>Available Surveys</button>
      </div>

      {activeTab === "surveys" ? (
        <div className="legacy-panel">
          <div className="legacy-panel-header"><div><h2>Surveys</h2><p>All visible survey assignments appear here in one simple list.</p></div></div>
          <div className="legacy-panel-body">
            {filteredAssignments.length ? (
              <table className="legacy-table">
                <thead>
                  <tr>
                    <th>Survey Name</th>
                    <th>Assigned To</th>
                    <th>Due Date</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAssignments.map((assignment) => {
                    const status = getSurveyAssignmentStatusForViewer(assignment, hrRole, user, visibleNames, users, completionUsersByAssignment);
                    const canArchive = hrRole === "admin" && status === "Completed";
                    const showAdminActions = canManage && status === "Assigned";
                    const showCompleteAction = !canManage && status === "Assigned" && isCurrentUserTargeted(assignment);
                    const hasOpened = openedAssignments.has(String(assignment.id));

                    return (
                      <tr
                        key={String(assignment.id)}
                        className="cursor-pointer"
                        onClick={() => {
                          const assignmentId = String(assignment.id);
                          markSurveyOpened(assignmentId);
                          router.push(`/surveys/${String(assignment.survey_id ?? "")}?assignmentId=${assignmentId}`);
                        }}
                      >
                        <td>
                          <div className="legacy-table-title">{String(assignment.title ?? "Survey")}</div>
                          <div className="legacy-table-subtitle">{library.find((item) => Number(item.id) === Number(assignment.survey_id))?.url ? "Survey iframe configured" : "No survey link"}</div>
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
                            {showCompleteAction ? <button type="button" className="legacy-primary-btn disabled:opacity-50 disabled:cursor-not-allowed" disabled={!hasOpened} onClick={(event) => { event.stopPropagation(); if (!hasOpened) return; void markComplete(assignment); }}><CheckCircle2 className="h-4 w-4" />Complete</button> : null}
                            {!showAdminActions && !canArchive && !showCompleteAction ? <span className="text-slate-400">-</span> : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : <div className="legacy-empty">No survey records are visible in the current view.</div>}
          </div>
        </div>
      ) : (
        <div className="legacy-panel">
          <div className="legacy-panel-header"><div><h2>Available Surveys</h2><p>Survey definitions only. Manage the library here.</p></div></div>
          <div className="legacy-panel-body">
            {filteredLibrary.length ? (
              <table className="legacy-table">
                <thead>
                  <tr>
                    <th>Survey Name</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLibrary.map((survey) => (
                    <tr key={String(survey.id)}>
                      <td>
                        <div className="legacy-table-title">{String(survey.title ?? "Survey")}</div>
                        <div className="legacy-table-subtitle">{String(survey.url ?? "").trim() ? "Survey iframe configured" : "No survey link"}</div>
                      </td>
                      <td>
                        <div className="flex items-center gap-2">
                          <button type="button" className="legacy-icon-btn" onClick={() => openEditSurvey(survey)}><Pencil className="h-4 w-4" /></button>
                          <button type="button" className="legacy-icon-btn" onClick={() => void handleDeleteSurvey(survey)}><Trash2 className="h-4 w-4" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <div className="legacy-empty">No surveys have been created yet.</div>}
          </div>
        </div>
      )}

      {showCreateModal ? (
        <div className="legacy-modal-overlay">
          <div className="legacy-modal">
            <div className="legacy-modal-header"><h2>{editingSurveyId ? "Edit Survey" : "Create Survey"}</h2><button type="button" className="legacy-icon-btn" onClick={resetCreateModal}><X className="h-4 w-4" /></button></div>
            <div className="legacy-modal-body">
              <div className="legacy-form-grid">
                <div className="legacy-form-group legacy-form-group--full"><label>Survey Name <span className="legacy-required">*</span></label><input value={surveyForm.title} onChange={(event) => setSurveyForm((current) => ({ ...current, title: event.target.value }))} />{validationErrors.title ? <p className="legacy-field-error">{validationErrors.title}</p> : null}</div>
                <div className="legacy-form-group legacy-form-group--full"><label>Microsoft Forms survey iframe link <span className="legacy-required">*</span></label><input value={surveyForm.url} onChange={(event) => setSurveyForm((current) => ({ ...current, url: event.target.value }))} />{validationErrors.url ? <p className="legacy-field-error">{validationErrors.url}</p> : null}</div>
              </div>
            </div>
            <div className="legacy-modal-footer"><button type="button" className="legacy-secondary-btn" onClick={resetCreateModal}>Cancel</button><button type="button" className="legacy-primary-btn" onClick={() => void submitSurvey()}><Save className="h-4 w-4" />{editingSurveyId ? "Update" : "Create"}</button></div>
          </div>
        </div>
      ) : null}

      {showAssignModal ? (
        <div className="legacy-modal-overlay">
          <div className="legacy-modal legacy-modal--wide">
            <div className="legacy-modal-header"><h2>{editingAssignmentId ? "Edit Survey Assignment" : "Assgin Survey"}</h2><button type="button" className="legacy-icon-btn" onClick={resetAssignModal}><X className="h-4 w-4" /></button></div>
            <div className="legacy-modal-body">
              <div className="legacy-form-grid">
                <div className="legacy-form-group legacy-form-group--full"><label>Select Survey <span className="legacy-required">*</span></label><select value={assignmentForm.surveyId} onChange={(event) => setAssignmentForm((current) => ({ ...current, surveyId: event.target.value }))}><option value="">Select survey</option>{library.map((item) => <option key={String(item.id)} value={String(item.id)}>{String(item.title ?? "Survey")}</option>)}</select>{validationErrors.surveyId ? <p className="legacy-field-error">{validationErrors.surveyId}</p> : null}</div>
                <div className="legacy-form-group"><label>Due Date</label><input type="date" value={assignmentForm.dueDate} onChange={(event) => setAssignmentForm((current) => ({ ...current, dueDate: event.target.value }))} /></div>
                <div className="legacy-form-group legacy-form-group--full"><div className="legacy-form-section"><div className="legacy-form-section__header"><h3>Assignment</h3><p>Choose who should receive this survey.</p></div><div className="legacy-form-section__body"><label className={`legacy-checkbox-row ${assignmentForm.allStaff ? "is-active" : ""}`}><input type="checkbox" checked={assignmentForm.allStaff} onChange={(event) => setAssignmentForm((current) => ({ ...current, allStaff: event.target.checked, userIds: event.target.checked ? [] : current.userIds, departmentIds: event.target.checked ? [] : current.departmentIds }))} /><span>All Staff</span></label><div className="legacy-picker-row"><div><label className="legacy-picker-label">Users</label><div className="legacy-chip-list legacy-chip-list--compact">{selectedUsers.length ? selectedUsers.map((candidate) => <span key={candidate.id} className="legacy-selection-tag">{candidate.name || candidate.email}<button type="button" onClick={() => setAssignmentForm((current) => ({ ...current, userIds: current.userIds.filter((value) => value !== candidate.id) }))} disabled={assignmentForm.allStaff}><X className="h-3 w-3" /></button></span>) : <span className="legacy-selection-empty">No users selected.</span>}</div></div><button type="button" className="legacy-secondary-btn" onClick={openUserPicker} disabled={assignmentForm.allStaff}><Plus className="h-4 w-4" />Add Users</button></div><div className="legacy-picker-row"><div><label className="legacy-picker-label">Departments</label><div className="legacy-chip-list legacy-chip-list--compact">{selectedDepartments.length ? selectedDepartments.map((candidate) => <span key={candidate.id} className="legacy-selection-tag">{candidate.name}<button type="button" onClick={() => setAssignmentForm((current) => ({ ...current, departmentIds: current.departmentIds.filter((value) => value !== candidate.id) }))} disabled={assignmentForm.allStaff}><X className="h-3 w-3" /></button></span>) : <span className="legacy-selection-empty">No departments selected.</span>}</div></div><button type="button" className="legacy-secondary-btn" onClick={openDepartmentPicker} disabled={assignmentForm.allStaff}><Plus className="h-4 w-4" />Add Departments</button></div>{validationErrors.targets ? <p className="legacy-field-error">{validationErrors.targets}</p> : null}</div></div></div>
              </div>
            </div>
            <div className="legacy-modal-footer"><button type="button" className="legacy-secondary-btn" onClick={resetAssignModal}>Cancel</button><button type="button" className="legacy-primary-btn" onClick={() => void submitAssignment()}><Save className="h-4 w-4" />{editingAssignmentId ? "Update" : "Assgin"}</button></div>
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
