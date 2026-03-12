"use client";

import { useEffect, useMemo, useState } from "react";
import { Building2, Mail, Search, Users } from "lucide-react";
import { getApiErrorMessage, getCurrentUser, getResource, type HrRecord } from "../lib/hr-client";
import { HrPortalHeader } from "./hr-portal-header";

export function EmployeeDirectory() {
  const [employees, setEmployees] = useState<HrRecord[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [userName, setUserName] = useState("HR Team");

  useEffect(() => {
    async function load() {
      try {
        const [employeeData, user] = await Promise.all([getResource("employees"), getCurrentUser()]);
        setEmployees(employeeData);
        setUserName(user.fullName);
      } catch (err) {
        setError(getApiErrorMessage(err));
      }
    }

    void load();
  }, []);

  const filtered = useMemo(() => {
    if (!query) return employees;
    return employees.filter((item) =>
      [item.full_name, item.department, item.job_title, item.email]
        .some((value) => String(value ?? "").toLowerCase().includes(query.toLowerCase()))
    );
  }, [employees, query]);

  return (
    <div>
      <HrPortalHeader
        title={`Employee Directory for ${userName}`}
        description="A standalone replacement for the SharePoint employee directory, retaining the card-based browse and search workflow."
        breadcrumb="Employees"
      />

      <section className="mb-8 grid gap-4 md:grid-cols-3">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
          <p className="text-sm text-slate-400">Visible employees</p>
          <p className="mt-3 text-3xl font-semibold text-white">{employees.length}</p>
        </div>
        <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
          <p className="text-sm text-slate-400">Departments</p>
          <p className="mt-3 text-3xl font-semibold text-white">{new Set(employees.map((item) => item.department)).size}</p>
        </div>
        <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
          <p className="text-sm text-slate-400">Directory search</p>
          <div className="relative mt-3">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search people, teams, titles" className="w-full rounded-2xl border border-white/10 bg-slate-950 px-11 py-3 text-sm text-white" />
          </div>
        </div>
      </section>

      {error ? <p className="mb-6 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</p> : null}

      <section className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
        {filtered.map((employee) => (
          <article key={String(employee.id)} className="rounded-[2rem] border border-white/10 bg-slate-900/60 p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="rounded-2xl bg-cyan-400/10 p-3 text-cyan-300">
                <Users className="h-5 w-5" />
              </div>
              <span className="rounded-full bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.2em] text-slate-400">
                {String(employee.department ?? "Team")}
              </span>
            </div>
            <h2 className="mt-5 text-xl font-semibold text-white">{String(employee.full_name ?? "Employee")}</h2>
            <p className="mt-2 text-sm text-slate-300">{String(employee.job_title ?? "Role not set")}</p>
            <div className="mt-6 space-y-3 text-sm text-slate-400">
              <div className="flex items-center gap-3"><Building2 className="h-4 w-4 text-slate-500" />{String(employee.department ?? "-")}</div>
              <div className="flex items-center gap-3"><Mail className="h-4 w-4 text-slate-500" />{String(employee.email ?? "-")}</div>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
