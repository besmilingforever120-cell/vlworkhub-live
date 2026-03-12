"use client";

import Link from "next/link";
import type { Route } from "next";
import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  BookOpen,
  CheckCircle,
  ClipboardList,
  FileSignature,
  Megaphone,
  PlayCircle,
  RefreshCw,
  Shield,
  SquareCheckBig,
  Users
} from "lucide-react";
import type { SessionUser, UserRole } from "@vlworkhub/types";
import { getApiErrorMessage, getCurrentUser, getResource, getSharedUsers, type HrRecord } from "../lib/hr-client";
import { HrPortalHeader } from "./hr-portal-header";

type StatCard = {
  title: string;
  value: string;
  detail: string[];
  href: Route;
  color: "blue" | "green" | "purple" | "amber" | "red";
  icon: React.ComponentType<{ className?: string }>;
};

function isPrivileged(roles: UserRole[]) {
  return roles.some((role) => role === "Admin" || role === "HR" || role === "Manager");
}

function formatDueDate(value: string) {
  if (!value) return "No due date";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString();
}

function daysUntil(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  const ms = parsed.getTime() - Date.now();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

export function HrDashboard() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [platformUsers, setPlatformUsers] = useState(0);
  const [announcements, setAnnouncements] = useState<HrRecord[]>([]);
  const [tasks, setTasks] = useState<HrRecord[]>([]);
  const [trainingAssignments, setTrainingAssignments] = useState<HrRecord[]>([]);
  const [surveyAssignments, setSurveyAssignments] = useState<HrRecord[]>([]);
  const [documents, setDocuments] = useState<HrRecord[]>([]);
  const [documentSignatures, setDocumentSignatures] = useState<HrRecord[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      setLoading(true);
      setError("");
      const [session, sharedUsers, announcementData, taskData, trainingData, surveyData, documentData, signatureData] = await Promise.all([
        getCurrentUser(),
        getSharedUsers(),
        getResource("announcements"),
        getResource("tasks"),
        getResource("training_assignments"),
        getResource("survey_assignments"),
        getResource("documents"),
        getResource("document_signatures")
      ]);

      setUser(session);
      setPlatformUsers(sharedUsers.length);
      setAnnouncements(announcementData);
      setTasks(taskData);
      setTrainingAssignments(trainingData);
      setSurveyAssignments(surveyData);
      setDocuments(documentData);
      setDocumentSignatures(signatureData);
    } catch (loadError) {
      setError(getApiErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const roles = user?.roles || (user?.role ? [user.role] : []);
  const privileged = isPrivileged(roles);

  const openTasks = useMemo(() => tasks.filter((item) => String(item.status || "").toLowerCase() !== "completed"), [tasks]);
  const pendingTraining = useMemo(() => trainingAssignments.filter((item) => String(item.status || "").toLowerCase() !== "completed"), [trainingAssignments]);
  const pendingSurveys = useMemo(() => surveyAssignments.filter((item) => String(item.status || "").toLowerCase() !== "completed"), [surveyAssignments]);
  const pendingSignatures = useMemo(() => documentSignatures.filter((item) => String(item.status || "").toLowerCase() !== "signed" && String(item.status || "").toLowerCase() !== "completed"), [documentSignatures]);
  const documentById = useMemo(() => new Map(documents.map((document) => [String(document.id), document])), [documents]);
  const announcementFeed = useMemo(() => announcements.slice().sort((left, right) => String(right.publish_date || "").localeCompare(String(left.publish_date || ""))).slice(0, 5), [announcements]);

  const stats: StatCard[] = [
    { title: "People", value: String(platformUsers), detail: ["Shared identity system", "VLWorkHub users"], href: "/admin", color: "blue", icon: Users },
    { title: "Documents", value: String(pendingSignatures.length), detail: ["Pending signatures", `${documents.length} total files`], href: "/documents", color: "green", icon: FileSignature },
    { title: "Training", value: String(pendingTraining.length), detail: ["Pending assignments", `${pendingSurveys.length} survey follow-ups`], href: "/training", color: "purple", icon: BookOpen },
    { title: "Tasks", value: String(openTasks.length), detail: ["Open work items", `${tasks.filter((item) => String(item.status || "").toLowerCase() === "in progress").length} in progress`], href: "/tasks", color: "amber", icon: SquareCheckBig },
    { title: "Announcements", value: String(announcementFeed.length), detail: ["Published updates", `${announcements.filter((item) => String(item.priority || "").toLowerCase().includes("important")).length} important`], href: "/announcements", color: "red", icon: Megaphone }
  ];

  return (
    <div className="hr-dashboard">
      <HrPortalHeader
        title={`Welcome back, ${user?.fullName || "HR Team"}`}
        description="The HR dashboard now reflects the SharePoint portal shell while using VLWorkHub shared identity, session, and API resources."
        breadcrumb="Dashboard"
      />

      {error ? <div className="hr-card" style={{ marginBottom: "20px", color: "#b91c1c", borderColor: "#fecaca", background: "#fff1f2" }}>{error}</div> : null}

      <section className="hr-dashboard__stats">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Link key={stat.title} href={stat.href} className={`hr-stat-card hr-stat-card--${stat.color}`}>
              <div className="hr-stat-card__icon"><Icon className="h-6 w-6" /></div>
              <div>
                <p className="hr-stat-card__value">{stat.value}</p>
                <p className="hr-stat-card__title">{stat.title}</p>
                <div className="hr-stat-card__detail-list">{stat.detail.map((line) => <span key={line}>{line}</span>)}</div>
              </div>
            </Link>
          );
        })}
      </section>

      <section className="hr-dashboard__grid">
        <div className="hr-card">
          <div className="hr-card__header"><div><h2 className="hr-card__title">Documents Requiring Signature</h2><p className="hr-card__subtitle">Pending acknowledgements and policy sign-offs.</p></div><Link href="/documents" className="hr-card__action">Open documents</Link></div>
          <div className="hr-activity-list">
            {pendingSignatures.length ? pendingSignatures.slice(0, 5).map((signature) => {
              const linkedDocument = documentById.get(String(signature.document_id));
              const dueDate = String(linkedDocument?.due_date || "");
              const overdue = dueDate ? (daysUntil(dueDate) ?? 0) < 0 : false;
              return (
                <div key={String(signature.id)} className="hr-activity-item">
                  <div className="hr-activity-item__icon hr-activity-item__icon--signature"><FileSignature className="h-4 w-4" /></div>
                  <div className="hr-activity-item__body">
                    <p><strong>{String(linkedDocument?.title || "HR Document")}</strong>{overdue ? <span className="hr-status-chip is-overdue" style={{ marginLeft: "8px" }}>Overdue</span> : null}</p>
                    <div className="hr-activity-item__meta">Signer: {String(signature.signer_name || "Unknown")} · Due: {formatDueDate(dueDate)}</div>
                    <div className="hr-activity-item__pending">Status: {String(signature.status || "Pending")}</div>
                  </div>
                </div>
              );
            }) : <div className="hr-empty"><CheckCircle className="mx-auto mb-2 h-8 w-8" /><p>All documents are signed.</p></div>}
          </div>
        </div>

        <div className="hr-card">
          <div className="hr-card__header"><div><h2 className="hr-card__title">Your Tasks</h2><p className="hr-card__subtitle">Open tasks remain in the right-hand dashboard panel.</p></div>{privileged ? <Link href="/tasks" className="hr-card__action hr-card__action--primary">+ Add Task</Link> : null}</div>
          <div className="hr-task-list">
            {openTasks.length ? openTasks.slice(0, 5).map((task) => {
              const priority = String(task.priority || "normal").toLowerCase();
              return (
                <div key={String(task.id)} className="hr-task-item">
                  <div>
                    <p className="hr-task-item__title">{String(task.title || "Task")}</p>
                    <div className="hr-task-item__meta"><span className={`hr-priority hr-priority--${priority}`}>{String(task.priority || "Normal")}</span><span className="hr-activity-item__meta">Due: {formatDueDate(String(task.due_date || ""))}</span></div>
                    <div className="hr-activity-item__pending">Assigned to: {String(task.assigned_to || "HR team")}</div>
                  </div>
                  <span className={`hr-status-chip ${String(task.status || "").toLowerCase() === "overdue" ? "is-overdue" : ""}`}>{String(task.status || "Pending")}</span>
                </div>
              );
            }) : <div className="hr-empty"><CheckCircle className="mx-auto mb-2 h-8 w-8" /><p>No pending tasks.</p></div>}
          </div>
        </div>

        <div className="hr-card">
          <div className="hr-card__header"><div><h2 className="hr-card__title">Pending Training</h2><p className="hr-card__subtitle">Assignments and progress follow-up from the training module.</p></div><Link href="/training" className="hr-card__action">Open training</Link></div>
          <div className="hr-activity-list">
            {pendingTraining.length ? pendingTraining.slice(0, 5).map((assignment) => {
              const overdue = String(assignment.due_date || "") ? (daysUntil(String(assignment.due_date || "")) ?? 0) < 0 : false;
              return (
                <div key={String(assignment.id)} className="hr-activity-item">
                  <div className="hr-activity-item__icon hr-activity-item__icon--training"><PlayCircle className="h-4 w-4" /></div>
                  <div className="hr-activity-item__body">
                    <p><strong>{String(assignment.title || "Training assignment")}</strong>{overdue ? <span className="hr-status-chip is-overdue" style={{ marginLeft: "8px" }}>Overdue</span> : null}</p>
                    <div className="hr-activity-item__meta">Assignee: {String(assignment.assignee_name || "Unknown")} · Due: {formatDueDate(String(assignment.due_date || ""))}</div>
                  </div>
                </div>
              );
            }) : <div className="hr-empty"><CheckCircle className="mx-auto mb-2 h-8 w-8" /><p>No pending training.</p></div>}
          </div>
        </div>

        <div className="hr-card">
          <div className="hr-card__header"><div><h2 className="hr-card__title">Pending Surveys</h2><p className="hr-card__subtitle">Survey follow-up remains a dedicated workflow queue.</p></div><Link href="/surveys" className="hr-card__action">Open surveys</Link></div>
          <div className="hr-activity-list">
            {pendingSurveys.length ? pendingSurveys.slice(0, 5).map((assignment) => {
              const overdue = String(assignment.due_date || "") ? (daysUntil(String(assignment.due_date || "")) ?? 0) < 0 : false;
              return (
                <div key={String(assignment.id)} className="hr-activity-item">
                  <div className="hr-activity-item__icon hr-activity-item__icon--task"><ClipboardList className="h-4 w-4" /></div>
                  <div className="hr-activity-item__body">
                    <p><strong>{String(assignment.title || "Survey assignment")}</strong>{overdue ? <span className="hr-status-chip is-overdue" style={{ marginLeft: "8px" }}>Overdue</span> : null}</p>
                    <div className="hr-activity-item__meta">Assignee: {String(assignment.assignee_name || "Unknown")} · Due: {formatDueDate(String(assignment.due_date || ""))}</div>
                  </div>
                </div>
              );
            }) : <div className="hr-empty"><CheckCircle className="mx-auto mb-2 h-8 w-8" /><p>No pending surveys.</p></div>}
          </div>
        </div>
      </section>

      <section className="hr-dashboard__announcements">
        <div className="hr-card__header">
          <div><h2 className="hr-section-title">Latest Announcements</h2><p className="hr-card__subtitle">Communications feed preserved as a dedicated dashboard section.</p></div>
          <div style={{ display: "flex", gap: "8px" }}>{privileged ? <Link href="/announcements" className="hr-action-button hr-action-button--primary">+ Publish</Link> : null}<button type="button" className="hr-action-button" onClick={() => void load()} disabled={loading}><RefreshCw className="mr-2 inline h-4 w-4" />{loading ? "Refreshing..." : "Refresh"}</button></div>
        </div>
        <div className="hr-announcement-list">
          {announcementFeed.length ? announcementFeed.map((item) => {
            const priority = String(item.priority || "Normal");
            const important = priority.toLowerCase().includes("important");
            return (
              <div key={String(item.id)} className="hr-activity-item">
                <div className="hr-activity-item__icon hr-activity-item__icon--announcement"><Megaphone className="h-4 w-4" /></div>
                <div className="hr-activity-item__body">
                  <p><strong>{String(item.title || "Announcement")}</strong>{important ? <span className="hr-status-chip is-overdue" style={{ marginLeft: "8px" }}>{priority}</span> : null}</p>
                  <div className="hr-activity-item__meta">Audience: {String(item.audience || "All staff")} · Publish date: {formatDueDate(String(item.publish_date || ""))}</div>
                  <div className="hr-activity-item__pending">{String(item.body || "No description provided.")}</div>
                </div>
              </div>
            );
          }) : <div className="hr-empty"><Shield className="mx-auto mb-2 h-8 w-8" /><p>No announcements published yet.</p></div>}
        </div>
      </section>
    </div>
  );
}
