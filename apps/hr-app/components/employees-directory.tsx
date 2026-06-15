"use client";

import Link from "next/link";
import type { Route } from "next";
import { useEffect, useMemo, useState } from "react";
import { Search, Shield, Users } from "lucide-react";
import { getApiErrorMessage, getCurrentUser, getVisibleEmployees, type HrVisibleEmployee } from "../lib/hr-client";

type RoleLabel = "Employees" | "My Team" | "My Profile";

function getRoleLabel(platformRole: string, hrRole: string): RoleLabel {
  const normalizedPlatformRole = String(platformRole || "USER").toUpperCase();
  if (normalizedPlatformRole === "SUPER_ADMIN" || normalizedPlatformRole === "ADMIN" || normalizedPlatformRole === "IT_ADMIN") {
    return "Employees";
  }

  const normalizedHrRole = String(hrRole || "").toUpperCase();
  if (normalizedHrRole === "MANAGER") {
    return "My Team";
  }

  return "My Profile";
}

function roleBadgeClass(role: string) {
  const normalized = String(role || "EMPLOYEE").toUpperCase();
  if (normalized === "ADMIN") return "inline-flex px-2 py-1 text-xs font-semibold bg-green-100 text-green-700 rounded-full";
  if (normalized === "MANAGER") return "inline-flex px-2 py-1 text-xs font-semibold bg-orange-100 text-orange-700 rounded-full";
  return "inline-flex px-2 py-1 text-xs font-semibold bg-blue-100 text-blue-700 rounded-full";
}

export function EmployeesDirectory() {
  const [employees, setEmployees] = useState<HrVisibleEmployee[]>([]);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState<RoleLabel>("Employees");

  useEffect(() => {
    void (async () => {
      try {
        setLoading(true);
        setError("");
        const [session, response] = await Promise.all([getCurrentUser(), getVisibleEmployees()]);
        setEmployees(response.employees || []);
        setTitle(getRoleLabel(String(session.platformRole || session.role || "USER"), String(session.roles?.[0] || "EMPLOYEE")));
      } catch (loadError) {
        setEmployees([]);
        setError(getApiErrorMessage(loadError));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filteredEmployees = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return employees;
    return employees.filter((employee) => {
      const haystack = [employee.display_name, employee.email, employee.department || "", employee.reports_to || ""].join(" ").toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [employees, query]);

  return (
    <div className="legacy-portal">
      <div className="legacy-header">
        <div>
          <h1 className="legacy-header__title">{title}</h1>
          <p className="legacy-header__subtitle">Open a visible employee profile to review documents, tasks, training, and surveys.</p>
          <div className="legacy-role"><Shield className="h-4 w-4" />Role-scoped employee visibility</div>
        </div>
      </div>

      {error ? <div className="hr-card" style={{ marginBottom: 20, color: "#7f1d1d", borderColor: "#fecaca", background: "#fff1f2" }}>{error}</div> : null}

      <section className="legacy-stats-grid">
        <div className="legacy-stat-card blue"><div className="legacy-stat-icon"><Users className="h-5 w-5" /></div><div><p className="legacy-stat-value">{employees.length}</p><p className="legacy-stat-title">Visible Employees</p></div></div>
      </section>

      <section className="legacy-toolbar" style={{ marginTop: 20 }}>
        <div className="legacy-toolbar__row">
          <div className="legacy-search" style={{ maxWidth: 520 }}>
            <Search className="h-4 w-4" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search name, email, department, or manager..."
            />
          </div>
        </div>
      </section>

      <section className="legacy-card">
        <div className="legacy-card-header">
          <div>
            <h3 className="legacy-card-title">Employee Profiles</h3>
            <p className="legacy-card-copy">Only employees within your allowed scope are listed here.</p>
          </div>
        </div>

        {loading ? <div className="legacy-empty">Loading employees...</div> : null}

        {!loading && filteredEmployees.length === 0 ? <div className="legacy-empty">No employees are visible in your current scope.</div> : null}

        {!loading && filteredEmployees.length > 0 ? (
          <div className="mt-5 overflow-x-auto">
            <table className="min-w-full text-left text-sm text-gray-700">
              <thead className="text-xs uppercase tracking-[0.16em] text-gray-500">
                <tr>
                  <th className="px-3 py-3">Employee</th>
                  <th className="px-3 py-3">HR Role</th>
                  <th className="px-3 py-3">Department</th>
                  <th className="px-3 py-3">Reports To</th>
                </tr>
              </thead>
              <tbody>
                {filteredEmployees.map((employee) => (
                  <tr key={employee.user_id} className="border-t border-gray-200">
                    <td className="px-3 py-4">
                      <Link
                        href={`/employees/${encodeURIComponent(employee.user_id)}` as Route}
                        className="text-sm font-semibold text-blue-700 hover:underline"
                        title={`Open profile for ${employee.display_name}`}
                      >
                        {employee.display_name || employee.email}
                      </Link>
                      <div className="text-xs text-gray-500">{employee.email}</div>
                    </td>
                    <td className="px-3 py-4"><span className={roleBadgeClass(employee.hr_role)}>{employee.hr_role}</span></td>
                    <td className="px-3 py-4 text-sm text-gray-700">{employee.department || "Unassigned"}</td>
                    <td className="px-3 py-4 text-sm text-gray-700">{employee.reports_to || "-"}</td>
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
