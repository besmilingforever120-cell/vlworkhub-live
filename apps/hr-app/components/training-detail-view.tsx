"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, Shield } from "lucide-react";
import { useRouter } from "next/navigation";
import type { SessionUser } from "@vlworkhub/types";
import {
  createResource,
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
  getCompletionUsersByAssignment,
  getTrainingAssignmentStatusForViewer,
  getCurrentPlatformUser,
  getVisibleDepartmentNames,
  isAssignmentTargetedToUser,
  isAssignmentVisible,
  type TrainingAssignmentRow,
  type TrainingLibraryRow
} from "../lib/training-helpers";
import { useHrRole } from "../lib/use-hr-role";
import { formatDate, formatHrRoleLabel, getVisibleHrUserNames } from "../lib/workflow-utils";

type Props = { trainingId: string };

export function TrainingDetailView({ trainingId }: Props) {
  const router = useRouter();
  const { role: hrRole } = useHrRole();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [users, setUsers] = useState<PlatformUserRecord[]>([]);
  const [departments, setDepartments] = useState<DepartmentRecord[]>([]);
  const [hrAssignments, setHrAssignments] = useState<HrAssignment[]>([]);
  const [library, setLibrary] = useState<TrainingLibraryRow[]>([]);
  const [assignments, setAssignments] = useState<TrainingAssignmentRow[]>([]);
  const [completions, setCompletions] = useState<HrRecord[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      setLoading(true);
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
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const currentPlatformUser = useMemo(() => getCurrentPlatformUser(user, users), [user, users]);
  const visibleNames = useMemo(
    () => getVisibleHrUserNames(hrRole, user?.id || "", user?.fullName || "", hrAssignments, users.map((candidate) => ({ id: candidate.id, fullName: candidate.name || candidate.email, email: candidate.email, roles: [], status: "active" }))),
    [hrAssignments, hrRole, user?.fullName, user?.id, users]
  );
  const visibleDepartmentNames = useMemo(() => getVisibleDepartmentNames(visibleNames, users, currentPlatformUser), [currentPlatformUser, users, visibleNames]);
  const training = useMemo(() => library.find((item) => String(item.id) === trainingId) || null, [library, trainingId]);
  console.log("[Training Detail] training", training);
  const visibleAssignments = useMemo(() => assignments.filter((assignment) => {
    if (Number(assignment.training_id) !== Number(trainingId)) return false;
    if (!isAssignmentVisible(assignment, hrRole, user, currentPlatformUser, visibleNames, visibleDepartmentNames)) return false;
    if (hrRole !== "admin" && String(assignment.status ?? "").trim().toLowerCase() === "archived") return false;
    return true;
  }), [assignments, currentPlatformUser, hrRole, trainingId, user, visibleDepartmentNames, visibleNames]);
  const primaryAssignment = useMemo(() => visibleAssignments.find((assignment) => isAssignmentTargetedToUser(assignment, user, currentPlatformUser)) || visibleAssignments[0] || null, [currentPlatformUser, user, visibleAssignments]);
  const completionUsersByAssignment = useMemo(() => getCompletionUsersByAssignment(completions), [completions]);
  const assignmentStatus = primaryAssignment
    ? getTrainingAssignmentStatusForViewer(primaryAssignment, hrRole, user, currentPlatformUser, visibleNames, users, completionUsersByAssignment)
    : "Assigned";
  const canComplete = Boolean(primaryAssignment && isAssignmentTargetedToUser(primaryAssignment, user, currentPlatformUser) && assignmentStatus === "Assigned");
  const canArchive = Boolean(primaryAssignment && hrRole === "admin" && assignmentStatus === "Completed");

  async function handleCompleteTraining() {
    if (!primaryAssignment || !user) return;
    const existingCompletion = completions.find((item) => String(item.assignment_id ?? "") === String(primaryAssignment.id) && String(item.user_name ?? "") === user.fullName);
    const completionPayload = { assignment_id: String(primaryAssignment.id), user_name: user.fullName, progress_percent: "100", completed_on: new Date().toISOString(), last_position_seconds: "0" };
    try {
      if (existingCompletion) {
        await updateResource("training_completions", Number(existingCompletion.id), completionPayload);
      } else {
        await createResource("training_completions", completionPayload);
      }
      await load();
      router.push("/training");
    } catch (completeError) {
      setError(getApiErrorMessage(completeError));
    }
  }

  async function handleArchiveTraining() {
    if (!primaryAssignment) return;
    try {
      await updateResource("training_assignments", Number(primaryAssignment.id), { title: String(primaryAssignment.title ?? "Training assignment"), training_id: String(primaryAssignment.training_id ?? ""), assignee_name: String(primaryAssignment.assignee_name ?? ""), due_date: String(primaryAssignment.due_date ?? ""), survey_url: String(primaryAssignment.survey_url ?? ""), status: "Archived" });
      await load();
      router.push("/training");
    } catch (archiveError) {
      setError(getApiErrorMessage(archiveError));
    }
  }

  if (loading) return <div className="legacy-empty">Loading training...</div>;
  if (error) return <div className="hr-card" style={{ color: "#b91c1c", borderColor: "#fecaca", background: "#fff1f2" }}>{error}</div>;
  if (!training) return <div className="legacy-empty">Training not found.</div>;

  return (
    <div className="w-full flex flex-col">
      <div className="flex items-center justify-between border-b bg-white p-4">
        <div className="flex min-w-0 items-center gap-4">
          <button type="button" className="legacy-secondary-btn" onClick={() => router.push("/training")}><ArrowLeft className="h-4 w-4" />Back</button>
          <div className="min-w-0">
            <h1 className="legacy-header__title truncate">{String(training.training_name ?? "Training")}</h1>
            <div className="mt-2 flex items-center gap-3 text-sm text-slate-600"><span className="legacy-role"><Shield className="h-4 w-4" />HR Role: {formatHrRoleLabel(hrRole)}</span></div>
          </div>
        </div>
        {canComplete ? <button type="button" className="legacy-primary-btn shrink-0" onClick={() => void handleCompleteTraining()}><CheckCircle2 className="h-4 w-4" />Complete Training</button> : null}
        {!canComplete && canArchive ? <button type="button" className="legacy-secondary-btn shrink-0" onClick={() => void handleArchiveTraining()}>Archive</button> : null}
      </div>

      <div className="px-4 pb-6 pt-4 lg:px-6 xl:px-8"><p className="legacy-header__subtitle">Watch the training content, complete the quiz, and then mark the training complete.</p></div>

      <section className="w-full px-4 lg:px-6 xl:px-8"><div className="legacy-panel w-full max-w-none"><div className="legacy-panel-header"><div><h2>Video</h2><p>Embedded training video</p></div></div><div className="legacy-panel-body"><div className="w-full h-[70vh] bg-slate-100 rounded-xl overflow-hidden">{String(training.video_iframe_link ?? "").trim() ? <div className="h-full w-full [&_iframe]:h-full [&_iframe]:w-full [&_iframe]:border-0" dangerouslySetInnerHTML={{ __html: String(training.video_iframe_link ?? "") }} /> : <div className="legacy-empty">No video iframe link configured.</div>}</div></div></div></section>
      <section className="w-full px-4 pt-6 lg:px-6 xl:px-8"><div className="legacy-panel w-full max-w-none"><div className="legacy-panel-header"><div><h2>Quiz</h2><p>Embedded Microsoft Forms quiz</p></div></div><div className="legacy-panel-body"><div className="w-full h-[65vh] bg-slate-100 rounded-xl overflow-hidden">{String(training.quiz_iframe_link ?? "").trim() ? <div className="h-full w-full [&_iframe]:h-full [&_iframe]:w-full [&_iframe]:border-0" dangerouslySetInnerHTML={{ __html: String(training.quiz_iframe_link ?? "") }} /> : <div className="legacy-empty">No quiz iframe link configured.</div>}</div></div></div></section>
      <section className="p-4 lg:px-6 xl:px-8"><div className="legacy-panel w-full max-w-none"><div className="legacy-panel-header"><div><h2>Training Details</h2><p>Assignment and completion information for this training.</p></div></div><div className="legacy-panel-body"><div className="legacy-detail-stack"><div className="legacy-detail-card"><h4>Assignment</h4><p>Assigned to: {String(primaryAssignment?.assignee_name ?? "-")}</p><p>Due date: {formatDate(primaryAssignment?.due_date)}</p><p>Status: <span className={`legacy-status ${assignmentStatus === "Completed" ? "completed" : assignmentStatus === "Archived" ? "archived" : "default"}`}>{assignmentStatus}</span></p><p>Quiz link: {String(training.quiz_iframe_link ?? "").trim() ? "Configured" : "Not configured"}</p></div></div></div></div></section>
    </div>
  );
}

