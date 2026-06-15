"use client";

import Link from "next/link";
import type { Route } from "next";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  FileSignature,
  Shield,
  SquareCheckBig,
  User
} from "lucide-react";
import {
  getApiErrorMessage,
  getEmployeeAudit,
  type EmployeeAuditDocument,
  type EmployeeAuditEmployee,
  type EmployeeAuditPayload,
  type EmployeeAuditSurvey,
  type EmployeeAuditTask,
  type EmployeeAuditTraining
} from "../lib/hr-client";

type Props = { userId: string };

type SectionId = "documents" | "tasks" | "training" | "surveys";

function formatDate(value: string | null | undefined) {
  const raw = String(value || "").trim();
  if (!raw) return "-";
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  return parsed.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function roleBadgeClass(role: string) {
  const normalized = String(role || "").toUpperCase();
  if (normalized === "ADMIN") return "inline-flex px-2 py-1 text-xs font-semibold bg-green-100 text-green-700 rounded-full";
  if (normalized === "MANAGER") return "inline-flex px-2 py-1 text-xs font-semibold bg-orange-100 text-orange-700 rounded-full";
  return "inline-flex px-2 py-1 text-xs font-semibold bg-blue-100 text-blue-700 rounded-full";
}

function statusChip(label: string, variant: "pending" | "signed" | "completed" | "archived" | "neutral") {
  const classMap: Record<string, string> = {
    pending: "hr-audit-chip hr-audit-chip--pending",
    signed: "hr-audit-chip hr-audit-chip--signed",
    completed: "hr-audit-chip hr-audit-chip--signed",
    archived: "hr-audit-chip hr-audit-chip--archived",
    neutral: "hr-audit-chip"
  };
  return <span className={classMap[variant] ?? "hr-audit-chip"}>{label}</span>;
}

function EmptyRow({ message }: { message: string }) {
  return (
    <tr>
      <td colSpan={10} className="px-3 py-6 text-center text-sm text-gray-500">{message}</td>
    </tr>
  );
}

function SectionAccordion({
  id,
  title,
  icon: Icon,
  open,
  onToggle,
  pendingCount,
  completedCount,
  children
}: {
  id: SectionId;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  open: boolean;
  onToggle: () => void;
  pendingCount: number;
  completedCount: number;
  children: React.ReactNode;
}) {
  return (
    <div className="hr-audit-section">
      <button
        type="button"
        className="hr-audit-section__toggle"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={`audit-section-${id}`}
      >
        <span className="hr-audit-section__icon"><Icon className="h-5 w-5" /></span>
        <span className="hr-audit-section__title">{title}</span>
        <span className="hr-audit-section__counts">
          <span className="hr-audit-chip hr-audit-chip--pending">{pendingCount} pending</span>
          <span className="hr-audit-chip hr-audit-chip--signed">{completedCount} completed</span>
        </span>
        {open
          ? <ChevronDown className="h-4 w-4 ml-auto shrink-0" />
          : <ChevronRight className="h-4 w-4 ml-auto shrink-0" />}
      </button>
      {open && (
        <div id={`audit-section-${id}`} className="hr-audit-section__body">
          {children}
        </div>
      )}
    </div>
  );
}

// ── Documents Table ────────────────────────────────────────────────────────────

function DocumentsSection({ pending, signed }: { pending: EmployeeAuditDocument[]; signed: EmployeeAuditDocument[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm text-left">
        <thead className="text-xs uppercase tracking-wide text-gray-500">
          <tr>
            <th className="px-3 py-2">File / Document</th>
            <th className="px-3 py-2">Category</th>
            <th className="px-3 py-2">Due Date</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2">Signed On</th>
          </tr>
        </thead>
        <tbody>
          {pending.length === 0 && signed.length === 0 && (
            <EmptyRow message="No documents assigned to this employee." />
          )}
          {pending.map((doc) => (
            <tr key={`doc-p-${doc.id}`} className="border-t border-gray-100 hover:bg-gray-50">
              <td className="px-3 py-3 font-medium text-gray-900">{doc.file_name}</td>
              <td className="px-3 py-3 text-gray-600">{doc.category_other ? `Other: ${doc.category_other}` : doc.category}</td>
              <td className="px-3 py-3 text-gray-500">{formatDate(doc.due_date)}</td>
              <td className="px-3 py-3">{statusChip("Pending", "pending")}</td>
              <td className="px-3 py-3 text-gray-400">-</td>
            </tr>
          ))}
          {signed.length > 0 && (
            <tr className="bg-gray-50">
              <td colSpan={5} className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                Signed / Completed
              </td>
            </tr>
          )}
          {signed.map((doc) => (
            <tr key={`doc-s-${doc.id}`} className="border-t border-gray-100 hover:bg-gray-50">
              <td className="px-3 py-3 font-medium text-gray-900">{doc.file_name}</td>
              <td className="px-3 py-3 text-gray-600">{doc.category_other ? `Other: ${doc.category_other}` : doc.category}</td>
              <td className="px-3 py-3 text-gray-500">{formatDate(doc.due_date)}</td>
              <td className="px-3 py-3">{statusChip(doc.status === "archived" ? "Archived" : "Signed", doc.status === "archived" ? "archived" : "signed")}</td>
              <td className="px-3 py-3 text-gray-500">{formatDate(doc.signed_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Tasks Table ────────────────────────────────────────────────────────────────

function TasksSection({ pending, completed }: { pending: EmployeeAuditTask[]; completed: EmployeeAuditTask[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm text-left">
        <thead className="text-xs uppercase tracking-wide text-gray-500">
          <tr>
            <th className="px-3 py-2">Task</th>
            <th className="px-3 py-2">Priority</th>
            <th className="px-3 py-2">Due Date</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2">Completed On</th>
          </tr>
        </thead>
        <tbody>
          {pending.length === 0 && completed.length === 0 && (
            <EmptyRow message="No tasks assigned to this employee." />
          )}
          {pending.map((task) => (
            <tr key={`task-p-${task.id}`} className="border-t border-gray-100 hover:bg-gray-50">
              <td className="px-3 py-3">
                <p className="font-medium text-gray-900">{task.title}</p>
                {task.description ? <p className="text-xs text-gray-400 mt-0.5">{task.description}</p> : null}
              </td>
              <td className="px-3 py-3 text-gray-600 capitalize">{task.priority || "Normal"}</td>
              <td className="px-3 py-3 text-gray-500">{formatDate(task.due_date)}</td>
              <td className="px-3 py-3">{statusChip(task.status || "Pending", "pending")}</td>
              <td className="px-3 py-3 text-gray-400">-</td>
            </tr>
          ))}
          {completed.length > 0 && (
            <tr className="bg-gray-50">
              <td colSpan={5} className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                Completed / Archived
              </td>
            </tr>
          )}
          {completed.map((task) => (
            <tr key={`task-c-${task.id}`} className="border-t border-gray-100 hover:bg-gray-50">
              <td className="px-3 py-3">
                <p className="font-medium text-gray-900">{task.title}</p>
                {task.description ? <p className="text-xs text-gray-400 mt-0.5">{task.description}</p> : null}
              </td>
              <td className="px-3 py-3 text-gray-600 capitalize">{task.priority || "Normal"}</td>
              <td className="px-3 py-3 text-gray-500">{formatDate(task.due_date)}</td>
              <td className="px-3 py-3">{statusChip(task.is_archived ? "Archived" : "Completed", task.is_archived ? "archived" : "completed")}</td>
              <td className="px-3 py-3 text-gray-500">{formatDate(task.completed_on)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Training Table ─────────────────────────────────────────────────────────────

function TrainingSection({ pending, completed }: { pending: EmployeeAuditTraining[]; completed: EmployeeAuditTraining[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm text-left">
        <thead className="text-xs uppercase tracking-wide text-gray-500">
          <tr>
            <th className="px-3 py-2">Training</th>
            <th className="px-3 py-2">Category</th>
            <th className="px-3 py-2">Due Date</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2">Progress</th>
            <th className="px-3 py-2">Completed On</th>
          </tr>
        </thead>
        <tbody>
          {pending.length === 0 && completed.length === 0 && (
            <EmptyRow message="No training assigned to this employee." />
          )}
          {pending.map((tr) => (
            <tr key={`tr-p-${tr.id}`} className="border-t border-gray-100 hover:bg-gray-50">
              <td className="px-3 py-3 font-medium text-gray-900">{tr.title}</td>
              <td className="px-3 py-3 text-gray-600">{tr.category || "-"}</td>
              <td className="px-3 py-3 text-gray-500">{formatDate(tr.due_date)}</td>
              <td className="px-3 py-3">{statusChip("Pending", "pending")}</td>
              <td className="px-3 py-3 text-gray-500">{tr.progress_percent}%</td>
              <td className="px-3 py-3 text-gray-400">-</td>
            </tr>
          ))}
          {completed.length > 0 && (
            <tr className="bg-gray-50">
              <td colSpan={6} className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                Completed / Archived
              </td>
            </tr>
          )}
          {completed.map((tr) => (
            <tr key={`tr-c-${tr.id}`} className="border-t border-gray-100 hover:bg-gray-50">
              <td className="px-3 py-3 font-medium text-gray-900">{tr.title}</td>
              <td className="px-3 py-3 text-gray-600">{tr.category || "-"}</td>
              <td className="px-3 py-3 text-gray-500">{formatDate(tr.due_date)}</td>
              <td className="px-3 py-3">{statusChip("Completed", "completed")}</td>
              <td className="px-3 py-3 text-gray-500">{tr.progress_percent}%</td>
              <td className="px-3 py-3 text-gray-500">{formatDate(tr.completed_on)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Surveys Table ──────────────────────────────────────────────────────────────

function SurveysSection({ pending, completed }: { pending: EmployeeAuditSurvey[]; completed: EmployeeAuditSurvey[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm text-left">
        <thead className="text-xs uppercase tracking-wide text-gray-500">
          <tr>
            <th className="px-3 py-2">Survey</th>
            <th className="px-3 py-2">Due Date</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2">Completed On</th>
          </tr>
        </thead>
        <tbody>
          {pending.length === 0 && completed.length === 0 && (
            <EmptyRow message="No surveys assigned to this employee." />
          )}
          {pending.map((sv) => (
            <tr key={`sv-p-${sv.id}`} className="border-t border-gray-100 hover:bg-gray-50">
              <td className="px-3 py-3 font-medium text-gray-900">{sv.title}</td>
              <td className="px-3 py-3 text-gray-500">{formatDate(sv.due_date)}</td>
              <td className="px-3 py-3">{statusChip("Pending", "pending")}</td>
              <td className="px-3 py-3 text-gray-400">-</td>
            </tr>
          ))}
          {completed.length > 0 && (
            <tr className="bg-gray-50">
              <td colSpan={4} className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                Completed / Archived
              </td>
            </tr>
          )}
          {completed.map((sv) => (
            <tr key={`sv-c-${sv.id}`} className="border-t border-gray-100 hover:bg-gray-50">
              <td className="px-3 py-3 font-medium text-gray-900">{sv.title}</td>
              <td className="px-3 py-3 text-gray-500">{formatDate(sv.due_date)}</td>
              <td className="px-3 py-3">{statusChip("Completed", "completed")}</td>
              <td className="px-3 py-3 text-gray-500">{formatDate(sv.completed_on)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Employee Header Card ───────────────────────────────────────────────────────

function EmployeeHeader({ employee }: { employee: EmployeeAuditEmployee }) {
  return (
    <div className="hr-audit-profile-card">
      <div className="hr-audit-profile-card__avatar">
        <User className="h-7 w-7" />
      </div>
      <div className="hr-audit-profile-card__body">
        <h2 className="hr-audit-profile-card__name">{employee.display_name || employee.email}</h2>
        <p className="hr-audit-profile-card__email">{employee.email}</p>
        <div className="hr-audit-profile-card__meta">
          <span><Shield className="h-3.5 w-3.5 inline mr-1" />HR Role: <span className={roleBadgeClass(employee.hr_role)}>{employee.hr_role || "—"}</span></span>
          <span>Department: <strong>{employee.department || "—"}</strong></span>
          {employee.reports_to ? <span>Reports To: <strong>{employee.reports_to}</strong></span> : null}
        </div>
      </div>
    </div>
  );
}

// ── Summary Count Cards ────────────────────────────────────────────────────────

function SummaryCards({ data }: { data: EmployeeAuditPayload }) {
  const items = [
    { label: "Pending Documents", value: data.documents.pending.length, color: "amber" },
    { label: "Signed Documents", value: data.documents.signed.length, color: "green" },
    { label: "Pending Tasks", value: data.tasks.pending.length, color: "amber" },
    { label: "Completed Tasks", value: data.tasks.completed.length, color: "green" },
    { label: "Pending Training", value: data.training.pending.length, color: "amber" },
    { label: "Completed Training", value: data.training.completed.length, color: "green" },
    { label: "Pending Surveys", value: data.surveys.pending.length, color: "amber" },
    { label: "Completed Surveys", value: data.surveys.completed.length, color: "green" }
  ];

  return (
    <div className="hr-audit-summary-grid">
      {items.map((item) => (
        <div key={item.label} className={`legacy-stat-card ${item.color}`}>
          <div>
            <p className="legacy-stat-value">{item.value}</p>
            <p className="legacy-stat-title">{item.label}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export function AdminEmployeeAudit({ userId }: Props) {
  const [data, setData] = useState<EmployeeAuditPayload | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [openSections, setOpenSections] = useState<Set<SectionId>>(new Set(["documents", "tasks", "training", "surveys"]));

  useEffect(() => {
    void (async () => {
      try {
        setLoading(true);
        setError("");
        const payload = await getEmployeeAudit(userId);
        setData(payload);
      } catch (err) {
        setError(getApiErrorMessage(err));
      } finally {
        setLoading(false);
      }
    })();
  }, [userId]);

  function toggleSection(id: SectionId) {
    setOpenSections((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  return (
    <div className="legacy-portal">
      <div className="mb-4">
        <Link href={"/admin" as Route} className="legacy-secondary-btn hr-audit-back-button">
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Admin</span>
        </Link>
      </div>

      {error ? (
        <div className="hr-card" style={{ marginBottom: 20, color: "#7f1d1d", borderColor: "#fecaca", background: "#fff1f2" }}>
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="hr-card" style={{ padding: 40, textAlign: "center", color: "#64748b" }}>
          Loading employee audit…
        </div>
      ) : data ? (
        <>
          <EmployeeHeader employee={data.employee} />
          <SummaryCards data={data} />

          <div className="hr-audit-sections">
            <SectionAccordion
              id="documents"
              title="Documents"
              icon={FileSignature}
              open={openSections.has("documents")}
              onToggle={() => toggleSection("documents")}
              pendingCount={data.documents.pending.length}
              completedCount={data.documents.signed.length}
            >
              <DocumentsSection pending={data.documents.pending} signed={data.documents.signed} />
            </SectionAccordion>

            <SectionAccordion
              id="tasks"
              title="Tasks"
              icon={SquareCheckBig}
              open={openSections.has("tasks")}
              onToggle={() => toggleSection("tasks")}
              pendingCount={data.tasks.pending.length}
              completedCount={data.tasks.completed.length}
            >
              <TasksSection pending={data.tasks.pending} completed={data.tasks.completed} />
            </SectionAccordion>

            <SectionAccordion
              id="training"
              title="Training"
              icon={BookOpen}
              open={openSections.has("training")}
              onToggle={() => toggleSection("training")}
              pendingCount={data.training.pending.length}
              completedCount={data.training.completed.length}
            >
              <TrainingSection pending={data.training.pending} completed={data.training.completed} />
            </SectionAccordion>

            <SectionAccordion
              id="surveys"
              title="Surveys"
              icon={ClipboardList}
              open={openSections.has("surveys")}
              onToggle={() => toggleSection("surveys")}
              pendingCount={data.surveys.pending.length}
              completedCount={data.surveys.completed.length}
            >
              <SurveysSection pending={data.surveys.pending} completed={data.surveys.completed} />
            </SectionAccordion>
          </div>
        </>
      ) : null}
    </div>
  );
}
