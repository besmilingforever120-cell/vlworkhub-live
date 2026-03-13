"use client";

import Link from "next/link";
import type { Route } from "next";
import { useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  CheckCircle,
  ClipboardList,
  FileSignature,
  Megaphone,
  PlayCircle,
  Shield,
  SquareCheckBig
} from "lucide-react";
import type { SessionUser } from "@vlworkhub/types";
import { getApiErrorMessage, getCurrentUser, getResource, getSharedUsers, type HrRecord } from "../lib/hr-client";
import { HrPortalHeader } from "./hr-portal-header";

type StatCard = {
  title: string;
  value: string;
  href: Route;
  color: "green" | "purple" | "amber" | "blue";
  icon: React.ComponentType<{ className?: string }>;
};

type HrAppRole = "admin" | "manager" | "employee";

type HrAccessContext = {
  role: HrAppRole;
  departmentId: string | null;
  visibleNames: string[];
};

function splitNames(value: string | null | undefined) {
  return String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
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

function resolveAccessContext(user: SessionUser | null, sharedUsers: Array<{ id: string; fullName: string }>, hrRoles: HrRecord[]): HrAccessContext {
  if (!user) {
    return { role: "employee", departmentId: null, visibleNames: [] };
  }

  const currentRole = hrRoles.find((item) => String(item.user_id ?? "") === user.id);
  const role = String(currentRole?.role ?? "employee").toLowerCase() as HrAppRole;
  const departmentId = currentRole?.department_id ? String(currentRole.department_id) : null;
  const namesByUserId = new Map(sharedUsers.map((item) => [item.id, item.fullName]));

  if (role === "admin") {
    return { role, departmentId, visibleNames: sharedUsers.map((item) => item.fullName) };
  }

  if (role === "manager" && departmentId) {
    const visibleNames = hrRoles
      .filter((item) => String(item.department_id ?? "") === departmentId)
      .map((item) => String(item.user_name ?? namesByUserId.get(String(item.user_id ?? "")) ?? ""))
      .filter(Boolean);
    if (!visibleNames.includes(user.fullName)) visibleNames.unshift(user.fullName);
    return { role, departmentId, visibleNames };
  }

  return { role, departmentId, visibleNames: [user.fullName] };
}

function filterByAssignees(items: HrRecord[], field: string, visibleNames: string[]) {
  return items.filter((item) => splitNames(String(item[field] ?? "")).some((name) => visibleNames.includes(name)));
}

function getSectionTitle(role: HrAppRole, singular: string, plural = singular) {
  if (role === "admin") return `All ${plural}`;
  if (role === "manager") return `Department ${plural}`;
  return `Your ${singular}`;
}

export function HrDashboard() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [sharedUsers, setSharedUsers] = useState<Array<{ id: string; fullName: string }>>([]);
  const [hrRoles, setHrRoles] = useState<HrRecord[]>([]);
  const [announcements, setAnnouncements] = useState<HrRecord[]>([]);
  const [tasks, setTasks] = useState<HrRecord[]>([]);
  const [trainingAssignments, setTrainingAssignments] = useState<HrRecord[]>([]);
  const [surveyAssignments, setSurveyAssignments] = useState<HrRecord[]>([]);
  const [documents, setDocuments] = useState<HrRecord[]>([]);
  const [documentSignatures, setDocumentSignatures] = useState<HrRecord[]>([]);
  const [error, setError] = useState("");

  async function load() {
    try {
      setError("");
      const [session, users, roleRows, announcementData, taskData, trainingData, surveyData, documentData, signatureData] = await Promise.all([
        getCurrentUser(),
        getSharedUsers(),
        getResource("hr_user_roles"),
        getResource("announcements"),
        getResource("tasks"),
        getResource("training_assignments"),
        getResource("survey_assignments"),
        getResource("documents"),
        getResource("document_signatures")
      ]);

      setUser(session);
      setSharedUsers(users.map((item) => ({ id: item.id, fullName: item.fullName })));
      setHrRoles(roleRows);
      setAnnouncements(announcementData);
      setTasks(taskData);
      setTrainingAssignments(trainingData);
      setSurveyAssignments(surveyData);
      setDocuments(documentData);
      setDocumentSignatures(signatureData);
    } catch (loadError) {
      setError(getApiErrorMessage(loadError));
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const access = useMemo(() => resolveAccessContext(user, sharedUsers, hrRoles), [user, sharedUsers, hrRoles]);
  const visibleTasks = useMemo(() => filterByAssignees(tasks, "assigned_to", access.visibleNames).filter((item) => String(item.status ?? "").toLowerCase() !== "completed"), [tasks, access.visibleNames]);
  const visibleTraining = useMemo(() => filterByAssignees(trainingAssignments, "assignee_name", access.visibleNames).filter((item) => String(item.status ?? "").toLowerCase() !== "completed"), [trainingAssignments, access.visibleNames]);
  const visibleSurveys = useMemo(() => filterByAssignees(surveyAssignments, "assignee_name", access.visibleNames).filter((item) => String(item.status ?? "").toLowerCase() !== "completed"), [surveyAssignments, access.visibleNames]);
  const visibleSignatures = useMemo(() => documentSignatures.filter((item) => String(item.status ?? "").toLowerCase() !== "signed" && access.visibleNames.includes(String(item.signer_name ?? ""))), [documentSignatures, access.visibleNames]);
  const documentById = useMemo(() => new Map(documents.map((document) => [String(document.id), document])), [documents]);
  const announcementFeed = useMemo(() => announcements.slice().sort((left, right) => String(right.publish_date || "").localeCompare(String(left.publish_date || ""))).slice(0, 5), [announcements]);

  const stats: StatCard[] = [
    { title: "Documents", value: String(visibleSignatures.length), href: "/documents", color: "green", icon: FileSignature },
    { title: "Training", value: String(visibleTraining.length), href: "/training", color: "purple", icon: BookOpen },
    { title: "Tasks", value: String(visibleTasks.length), href: "/tasks", color: "amber", icon: SquareCheckBig },
    { title: "Surveys", value: String(visibleSurveys.length), href: "/surveys", color: "blue", icon: ClipboardList }
  ];

  return (
    <div className="hr-dashboard">
      <HrPortalHeader
        title={`Welcome back, ${user?.fullName || "HR Team"}`}
        description="The HR dashboard now reflects the user context from shared platform identity and HR-specific application permissions."
        breadcrumb="Dashboard"
        showBreadcrumb={false}
      />

      {error ? <div className="hr-card" style={{ marginBottom: "20px", color: "#b91c1c", borderColor: "#fecaca", background: "#fff1f2" }}>{error}</div> : null}

      <section className="hr-dashboard__stats">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Link key={stat.title} href={stat.href} className={`hr-stat-card hr-stat-card--${stat.color} hr-stat-card--compact`}>
              <div className="hr-stat-card__icon"><Icon className="h-6 w-6" /></div>
              <div>
                <p className="hr-stat-card__value">{stat.value}</p>
                <p className="hr-stat-card__title hr-stat-card__title--primary">{stat.title}</p>
              </div>
            </Link>
          );
        })}
      </section>

      <section className="hr-dashboard__grid">
        <div className="hr-card">
          <div className="hr-card__header"><div><h2 className="hr-card__title">Documents requiring signature</h2><p className="hr-card__subtitle">Only signature requests visible to your HR role are shown here.</p></div></div>
          <div className="hr-activity-list">
            {visibleSignatures.length ? visibleSignatures.slice(0, 5).map((signature) => {
              const linkedDocument = documentById.get(String(signature.document_id));
              const dueDate = String(linkedDocument?.due_date || "");
              const overdue = dueDate ? (daysUntil(dueDate) ?? 0) < 0 : false;
              return (
                <div key={String(signature.id)} className="hr-activity-item">
                  <div className="hr-activity-item__icon hr-activity-item__icon--signature"><FileSignature className="h-4 w-4" /></div>
                  <div className="hr-activity-item__body">
                    <p><strong>{String(linkedDocument?.title || "HR Document")}</strong>{overdue ? <span className="hr-status-chip is-overdue" style={{ marginLeft: "8px" }}>Overdue</span> : null}</p>
                    <div className="hr-activity-item__meta">Signer: {String(signature.signer_name || "Unknown")} · Due: {formatDueDate(dueDate)}</div>
                  </div>
                </div>
              );
            }) : <div className="hr-empty"><CheckCircle className="mx-auto mb-2 h-8 w-8" /><p>No documents require signature.</p></div>}
          </div>
        </div>

        <div className="hr-card">
          <div className="hr-card__header"><div><h2 className="hr-card__title">{getSectionTitle(access.role, "Task", "Tasks")}</h2><p className="hr-card__subtitle">Assignments respect your HR application role and department visibility.</p></div></div>
          <div className="hr-task-list">
            {visibleTasks.length ? visibleTasks.slice(0, 5).map((task) => {
              const priority = String(task.priority || "normal").toLowerCase();
              return (
                <div key={String(task.id)} className="hr-task-item">
                  <div>
                    <p className="hr-task-item__title">{String(task.title || "Task")}</p>
                    <div className="hr-task-item__meta"><span className={`hr-priority hr-priority--${priority}`}>{String(task.priority || "Normal")}</span><span className="hr-activity-item__meta">Due: {formatDueDate(String(task.due_date || ""))}</span></div>
                    <div className="hr-activity-item__pending">Assigned to: {String(task.assigned_to || "HR team")}</div>
                  </div>
                  <span className="hr-status-chip">{String(task.status || "Pending")}</span>
                </div>
              );
            }) : <div className="hr-empty"><CheckCircle className="mx-auto mb-2 h-8 w-8" /><p>No visible tasks.</p></div>}
          </div>
        </div>

        <div className="hr-card">
          <div className="hr-card__header"><div><h2 className="hr-card__title">{getSectionTitle(access.role, "Training", "Training")}</h2><p className="hr-card__subtitle">Training assignments shown here match your HR permission scope.</p></div></div>
          <div className="hr-activity-list">
            {visibleTraining.length ? visibleTraining.slice(0, 5).map((assignment) => {
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
            }) : <div className="hr-empty"><CheckCircle className="mx-auto mb-2 h-8 w-8" /><p>No visible training assignments.</p></div>}
          </div>
        </div>

        <div className="hr-card">
          <div className="hr-card__header"><div><h2 className="hr-card__title">{getSectionTitle(access.role, "Survey", "Surveys")}</h2><p className="hr-card__subtitle">Survey assignments shown here follow the same HR visibility rules.</p></div></div>
          <div className="hr-activity-list">
            {visibleSurveys.length ? visibleSurveys.slice(0, 5).map((assignment) => {
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
            }) : <div className="hr-empty"><CheckCircle className="mx-auto mb-2 h-8 w-8" /><p>No visible survey assignments.</p></div>}
          </div>
        </div>
      </section>

      <section className="hr-dashboard__announcements">
        <div className="hr-card__header">
          <div><h2 className="hr-section-title">Announcements feed</h2><p className="hr-card__subtitle">Published communications remain visible as a passive feed on the dashboard.</p></div>
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
