"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, ClipboardList, Shield } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import type { SessionUser } from "@vlworkhub/types";
import {
  createResource,
  getApiErrorMessage,
  getCurrentUser,
  getPlatformUsers,
  getResource,
  updateResource,
  type HrRecord,
  type PlatformUserRecord
} from "../lib/hr-client";
import { useHrRole } from "../lib/use-hr-role";
import { formatDate, formatHrRoleLabel } from "../lib/workflow-utils";

type Props = { surveyId: string };

function asString(value: string | number | null | undefined) {
  return String(value ?? "").trim();
}

function normalizeEmbeddedSurvey(html: string) {
  const trimmed = html.trim();
  if (!trimmed) return "";

  return trimmed
    .replace(/\swidth=("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\sheight=("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\sstyle=("[^"]*"|'[^']*')/gi, "")
    .replace(
      /<iframe\b/gi,
      '<iframe style="width:100%; min-width:100%; height:1100px; min-height:1100px; border:0; display:block;"'
    );
}

export function SurveyDetailView({ surveyId }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { role: hrRole } = useHrRole();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [users, setUsers] = useState<PlatformUserRecord[]>([]);
  const [surveys, setSurveys] = useState<HrRecord[]>([]);
  const [assignments, setAssignments] = useState<HrRecord[]>([]);
  const [completions, setCompletions] = useState<HrRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCompleting, setIsCompleting] = useState(false);
  const [showCompleteConfirm, setShowCompleteConfirm] = useState(false);
  const [error, setError] = useState("");

  const assignmentId = searchParams.get("assignmentId") || "";

  async function load() {
    try {
      setLoading(true);
      setError("");
      const [session, platformUsers, surveyRows, assignmentRows, completionRows] = await Promise.all([
        getCurrentUser(),
        getPlatformUsers(),
        getResource("surveys"),
        getResource("survey_assignments"),
        getResource("survey_completions")
      ]);
      setUser(session);
      setUsers(platformUsers.items || []);
      setSurveys(surveyRows || []);
      setAssignments(assignmentRows || []);
      setCompletions(completionRows || []);
    } catch (loadError) {
      setError(getApiErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!user?.id || !assignmentId) return;
    const storageKey = `vlworkhub-survey-opened-${user.id}`;

    try {
      const raw = window.localStorage.getItem(storageKey);
      const parsed = raw ? JSON.parse(raw) : [];
      const next = new Set(Array.isArray(parsed) ? parsed.map((value) => String(value)) : []);
      next.add(String(assignmentId));
      window.localStorage.setItem(storageKey, JSON.stringify(Array.from(next)));
    } catch {
      window.localStorage.setItem(storageKey, JSON.stringify([String(assignmentId)]));
    }
  }, [assignmentId, user?.id]);

  const survey = useMemo(() => surveys.find((item) => String(item.id) === surveyId) || null, [surveys, surveyId]);
  const assignment = useMemo(() => assignments.find((item) => String(item.id) === assignmentId) || null, [assignmentId, assignments]);
  const currentPlatformUser = useMemo(
    () => users.find((candidate) => candidate.id === user?.id) || null,
    [user?.id, users]
  );
  const existingCompletion = useMemo(
    () => completions.find((item) => String(item.assignment_id ?? "") === assignmentId && String(item.user_id ?? "") === String(user?.id ?? "")) || null,
    [assignmentId, completions, user?.id]
  );
  const isAssignedToCurrentUser = useMemo(() => {
    if (!assignment || !user) return false;

    if (Boolean(assignment.all_staff)) return true;
    if (String(assignment.user_id ?? "") === String(user.id)) return true;

    const assignmentDepartment = asString(assignment.department_name);
    const currentDepartment = asString(currentPlatformUser?.department_name);
    if (assignmentDepartment && currentDepartment && assignmentDepartment === currentDepartment) {
      return true;
    }

    return asString(assignment.user_name) === asString(user.fullName);
  }, [assignment, currentPlatformUser?.department_name, user]);
  const isArchived = asString(assignment?.status).toLowerCase() === "archived";
  const canComplete = Boolean(user && assignmentId && assignment && !existingCompletion && !isArchived && isAssignedToCurrentUser);

  async function handleCompleteSurvey() {
    if (!user || !assignmentId) return;

    const payload = {
      assignment_id: assignmentId,
      user_id: user.id,
      completed_on: new Date().toISOString()
    };

    try {
      setIsCompleting(true);
      if (existingCompletion) {
        await updateResource("survey_completions", Number(existingCompletion.id), payload);
      } else {
        await createResource("survey_completions", payload);
      }
      setShowCompleteConfirm(false);
      await load();
      router.push("/surveys");
    } catch (completeError) {
      setError(getApiErrorMessage(completeError));
    } finally {
      setIsCompleting(false);
    }
  }

  if (loading) return <div className="legacy-empty">Loading survey...</div>;
  if (error) return <div className="hr-card" style={{ color: "#b91c1c", borderColor: "#fecaca", background: "#fff1f2" }}>{error}</div>;
  if (!survey) return <div className="legacy-empty">Survey not found.</div>;

  return (
    <div className="w-full flex flex-col">
      <div className="flex items-center justify-between border-b bg-white p-4">
        <div className="flex min-w-0 items-center gap-4">
          <button type="button" className="legacy-secondary-btn" onClick={() => router.push("/surveys")}><ArrowLeft className="h-4 w-4" />Back</button>
          <div className="min-w-0">
            <h1 className="legacy-header__title truncate">{asString(survey.title) || "Survey"}</h1>
            <div className="mt-2 flex items-center gap-3 text-sm text-slate-600"><span className="legacy-role"><Shield className="h-4 w-4" />HR Role: {formatHrRoleLabel(hrRole)}</span></div>
          </div>
        </div>
        {canComplete ? (
          <button type="button" className="legacy-primary-btn shrink-0" onClick={() => setShowCompleteConfirm(true)}>
            <CheckCircle2 className="h-4 w-4" />Complete Survey
          </button>
        ) : null}
      </div>

      <div className="px-4 pb-6 pt-4 lg:px-6 xl:px-8">
        <p className="legacy-header__subtitle">Complete and submit the Microsoft Form, then mark the survey complete here.</p>
      </div>

      <section className="w-full px-4 lg:px-6 xl:px-8">
        <div className="legacy-panel w-full max-w-none">
          <div className="legacy-panel-header">
            <div>
              <h2>Survey Form</h2>
              <p>Embedded Microsoft Forms survey</p>
            </div>
          </div>
          <div className="legacy-panel-body">
            <div className="w-full min-h-[1100px] bg-slate-100 rounded-xl overflow-hidden">
              {asString(survey?.url) ? (
                <div
                  className="h-full w-full [&_iframe]:!w-full [&_iframe]:!min-w-full [&_iframe]:!border-0"
                  dangerouslySetInnerHTML={{ __html: normalizeEmbeddedSurvey(asString(survey.url)) }}
                />
              ) : (
                <div className="legacy-empty">No survey iframe link configured.</div>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="p-4 lg:px-6 xl:px-8">
        <div className="legacy-panel w-full max-w-none">
          <div className="legacy-panel-header">
            <div>
              <h2>Survey Details</h2>
              <p>Assignment and due date information.</p>
            </div>
          </div>
          <div className="legacy-panel-body">
            <div className="legacy-detail-stack">
              <div className="legacy-detail-card">
                <h4>Assignment</h4>
                <p>Assigned to: {asString(assignment?.assignee_name) || "-"}</p>
                <p>Due date: {formatDate(asString(assignment?.due_date) || null)}</p>
                <p>Status: {existingCompletion ? "Completed" : asString(assignment?.status) || "Assigned"}</p>
                <p>Survey link: {asString(survey.url) ? "Configured" : "Not configured"}</p>
              </div>
              <div className="legacy-detail-card">
                <button type="button" className="legacy-secondary-btn" onClick={() => router.push("/surveys")}>
                  <ClipboardList className="h-4 w-4" />Back to Surveys
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {showCompleteConfirm ? (
        <div className="legacy-modal-overlay">
          <div className="legacy-modal" style={{ maxWidth: 560 }}>
            <div className="legacy-modal-header">
              <h2>Mark Survey as Completed?</h2>
            </div>
            <div className="legacy-modal-body">
              <p>Are you sure you completed this survey? Once marked completed, this assignment will move to completed status.</p>
            </div>
            <div className="legacy-modal-footer">
              <button
                type="button"
                className="legacy-secondary-btn"
                onClick={() => setShowCompleteConfirm(false)}
                disabled={isCompleting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="legacy-primary-btn"
                onClick={() => void handleCompleteSurvey()}
                disabled={isCompleting}
              >
                <CheckCircle2 className="h-4 w-4" /> {isCompleting ? "Saving..." : "Confirm Completion"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
