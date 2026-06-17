"use client";

import Link from "next/link";
import type { Route } from "next";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Briefcase, ClipboardList, FileSignature, SearchCheck, SquareCheckBig, Users } from "lucide-react";
import { getAdminDepartmentAudit, getApiErrorMessage, type DepartmentAuditRow } from "../lib/hr-client";

function roleBadgeClass(role: string) {
  const normalized = String(role || "").toUpperCase();
  if (normalized === "ADMIN") return "inline-flex px-2 py-1 text-xs font-semibold bg-green-100 text-green-700 rounded-full";
  if (normalized === "MANAGER") return "inline-flex px-2 py-1 text-xs font-semibold bg-orange-100 text-orange-700 rounded-full";
  return "inline-flex px-2 py-1 text-xs font-semibold bg-blue-100 text-blue-700 rounded-full";
}

export function DepartmentAuditPanel() {
  const [departments, setDepartments] = useState<string[]>([]);
  const [selectedDepartment, setSelectedDepartment] = useState("");
  const [rows, setRows] = useState<DepartmentAuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        setLoading(true);
        setError("");
        const payload = await getAdminDepartmentAudit(selectedDepartment || undefined);
        const nextDepartments = payload.departments || [];
        setDepartments(nextDepartments);
        setRows(payload.rows || []);

        if (!selectedDepartment && nextDepartments.length > 0) {
          setSelectedDepartment(nextDepartments[0]);
        }
      } catch (loadError) {
        setDepartments([]);
        setRows([]);
        setError(getApiErrorMessage(loadError));
      } finally {
        setLoading(false);
      }
    })();
  }, [selectedDepartment]);

  const summary = useMemo(() => {
    const managers = rows.filter((row) => row.hr_role === "MANAGER" || row.hr_role === "ADMIN").length;
    const totals = rows.reduce(
      (acc, row) => {
        acc.pendingTasks += row.counts.tasks.pending;
        acc.pendingTraining += row.counts.training.pending;
        acc.pendingSurveys += row.counts.surveys.pending;
        acc.pendingDocuments += row.counts.documents.pending;
        return acc;
      },
      {
        pendingTasks: 0,
        pendingTraining: 0,
        pendingSurveys: 0,
        pendingDocuments: 0
      }
    );

    return {
      employees: rows.length,
      managers,
      ...totals
    };
  }, [rows]);

  return (
    <div className="legacy-portal">
      <div className="mb-4">
        <Link href={"/admin" as Route} className="legacy-secondary-btn hr-audit-back-button">
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Admin</span>
        </Link>
      </div>

      {error ? <div className="hr-card" style={{ marginBottom: 20, color: "#7f1d1d", borderColor: "#fecaca", background: "#fff1f2" }}>{error}</div> : null}

      <section className="legacy-card">
        <div className="legacy-card-header">
          <div>
            <h3 className="legacy-card-title">Department</h3>
            <p className="legacy-card-copy">Select a department to review pending and completed HR item counts for all users in that department.</p>
          </div>
        </div>
        <div className="legacy-toolbar" style={{ marginTop: 12 }}>
          <div className="legacy-filter-group">
            <select value={selectedDepartment} onChange={(event) => setSelectedDepartment(event.target.value)}>
              <option value="">Select department</option>
              {departments.map((department) => (
                <option key={department} value={department}>{department}</option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section className="legacy-stats-grid" style={{ marginTop: 20 }}>
        <div className="legacy-stat-card blue"><div className="legacy-stat-icon"><Users className="h-5 w-5" /></div><div><p className="legacy-stat-value">{summary.employees}</p><p className="legacy-stat-title">Employees in Department</p></div></div>
        <div className="legacy-stat-card amber"><div className="legacy-stat-icon"><Briefcase className="h-5 w-5" /></div><div><p className="legacy-stat-value">{summary.managers}</p><p className="legacy-stat-title">Managers</p></div></div>
        <div className="legacy-stat-card amber"><div className="legacy-stat-icon"><FileSignature className="h-5 w-5" /></div><div><p className="legacy-stat-value">{summary.pendingDocuments}</p><p className="legacy-stat-title">Total Pending Documents</p></div></div>
        <div className="legacy-stat-card green"><div className="legacy-stat-icon"><SquareCheckBig className="h-5 w-5" /></div><div><p className="legacy-stat-value">{summary.pendingTasks}</p><p className="legacy-stat-title">Total Pending Tasks</p></div></div>
        <div className="legacy-stat-card blue"><div className="legacy-stat-icon"><SearchCheck className="h-5 w-5" /></div><div><p className="legacy-stat-value">{summary.pendingTraining}</p><p className="legacy-stat-title">Total Pending Training</p></div></div>
        <div className="legacy-stat-card amber"><div className="legacy-stat-icon"><ClipboardList className="h-5 w-5" /></div><div><p className="legacy-stat-value">{summary.pendingSurveys}</p><p className="legacy-stat-title">Total Pending Surveys</p></div></div>
      </section>

      <section className="legacy-card" style={{ marginTop: 20 }}>
        <div className="legacy-card-header">
          <div>
            <h3 className="legacy-card-title">Department Audit Table</h3>
            <p className="legacy-card-copy">Counts only. No file contents or sensitive document bodies are exposed.</p>
          </div>
        </div>

        {loading ? <div className="legacy-empty">Loading department audit...</div> : null}

        {!loading && selectedDepartment && rows.length === 0 ? <div className="legacy-empty">No users found in the selected department.</div> : null}

        {!loading && !selectedDepartment ? <div className="legacy-empty">Select a department to view audit counts.</div> : null}

        {!loading && selectedDepartment && rows.length > 0 ? (
          <div className="mt-4 department-audit-table-wrap">
            <table className="department-audit-table min-w-full text-left text-sm text-gray-700">
              <thead className="department-audit-table__head text-xs uppercase tracking-[0.16em] text-gray-500">
                <tr>
                  <th className="department-audit-table__cell department-audit-table__cell--employee">Employee</th>
                  <th className="department-audit-table__cell">HR Role</th>
                  <th className="department-audit-table__cell department-audit-table__cell--number">Tasks Pending</th>
                  <th className="department-audit-table__cell department-audit-table__cell--number">Tasks Completed</th>
                  <th className="department-audit-table__cell department-audit-table__cell--number">Training Pending</th>
                  <th className="department-audit-table__cell department-audit-table__cell--number">Training Completed</th>
                  <th className="department-audit-table__cell department-audit-table__cell--number">Surveys Pending</th>
                  <th className="department-audit-table__cell department-audit-table__cell--number">Surveys Completed</th>
                  <th className="department-audit-table__cell department-audit-table__cell--number">Documents Pending</th>
                  <th className="department-audit-table__cell department-audit-table__cell--number">Documents Completed</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.user_id} className="department-audit-table__row border-t border-gray-200">
                    <td className="department-audit-table__cell department-audit-table__cell--employee">
                      <Link
                        href={`/employees/${encodeURIComponent(row.user_id)}` as Route}
                        className="department-audit-table__employee-link text-sm font-semibold text-blue-700 hover:underline"
                        title={`Open profile for ${row.employee_name}`}
                      >
                        {row.employee_name || row.email}
                      </Link>
                      <div className="department-audit-table__employee-email text-xs text-gray-500">{row.email}</div>
                    </td>
                    <td className="department-audit-table__cell"><span className={roleBadgeClass(row.hr_role)}>{row.hr_role}</span></td>
                    <td className="department-audit-table__cell department-audit-table__cell--number">{row.counts.tasks.pending}</td>
                    <td className="department-audit-table__cell department-audit-table__cell--number">{row.counts.tasks.completed}</td>
                    <td className="department-audit-table__cell department-audit-table__cell--number">{row.counts.training.pending}</td>
                    <td className="department-audit-table__cell department-audit-table__cell--number">{row.counts.training.completed}</td>
                    <td className="department-audit-table__cell department-audit-table__cell--number">{row.counts.surveys.pending}</td>
                    <td className="department-audit-table__cell department-audit-table__cell--number">{row.counts.surveys.completed}</td>
                    <td className="department-audit-table__cell department-audit-table__cell--number">{row.counts.documents.pending}</td>
                    <td className="department-audit-table__cell department-audit-table__cell--number">{row.counts.documents.completed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </div>
  );
}
