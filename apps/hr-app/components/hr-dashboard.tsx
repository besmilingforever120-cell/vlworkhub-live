"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BookOpen, FileText, Megaphone, UserRoundSearch, Workflow } from "lucide-react";
import type { HrRecord } from "../lib/hr-client";
import { getApiErrorMessage, getCurrentUser, getResource } from "../lib/hr-client";
import { HrPortalHeader } from "./hr-portal-header";
import { HrStatCard } from "./hr-stat-card";

export function HrDashboard() {
  const [employees, setEmployees] = useState<HrRecord[]>([]);
  const [announcements, setAnnouncements] = useState<HrRecord[]>([]);
  const [tasks, setTasks] = useState<HrRecord[]>([]);
  const [trainingAssignments, setTrainingAssignments] = useState<HrRecord[]>([]);
  const [documents, setDocuments] = useState<HrRecord[]>([]);
  const [userName, setUserName] = useState("HR Team");
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const [employeeData, announcementData, taskData, assignmentData, documentData, user] =
          await Promise.all([
            getResource("employees"),
            getResource("announcements"),
            getResource("tasks"),
            getResource("training_assignments"),
            getResource("documents"),
            getCurrentUser()
          ]);

        setEmployees(employeeData);
        setAnnouncements(announcementData);
        setTasks(taskData);
        setTrainingAssignments(assignmentData);
        setDocuments(documentData);
        setUserName(user.fullName);
      } catch (err) {
        setError(getApiErrorMessage(err));
      }
    }

    void load();
  }, []);

  const openTasks = useMemo(
    () => tasks.filter((item) => String(item.status ?? "").toLowerCase() !== "completed"),
    [tasks]
  );

  return (
    <div>
      <HrPortalHeader
        title={`Welcome back, ${userName}`}
        description="This HR dashboard preserves the legacy portal's operational overview while running as a Next.js application with shared VLWorkHub authentication."
        breadcrumb="Dashboard"
      />

      {error ? <p className="mb-6 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</p> : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <HrStatCard title="Employees" value={employees.length} detail="Directory and org visibility." icon={UserRoundSearch} />
        <HrStatCard title="Announcements" value={announcements.length} detail="Active internal communications." icon={Megaphone} />
        <HrStatCard title="Tasks" value={openTasks.length} detail="Open or in-progress work items." icon={Workflow} />
        <HrStatCard title="Training" value={trainingAssignments.length} detail="Assignments awaiting progress." icon={BookOpen} />
        <HrStatCard title="Documents" value={documents.length} detail="Policies and onboarding assets." icon={FileText} />
      </section>

      <section className="mt-8 grid gap-8 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-[2rem] border border-white/10 bg-white/5 p-6">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-white">Priority announcements</h2>
              <p className="mt-2 text-sm text-slate-400">Latest items from the migrated HR communications board.</p>
            </div>
            <Link href="/announcements" className="text-sm text-cyan-300">
              Open announcements
            </Link>
          </div>
          <div className="space-y-4">
            {announcements.slice(0, 4).map((item) => (
              <div key={String(item.id)} className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-medium text-white">{String(item.title ?? "Announcement")}</h3>
                  <span className="rounded-full bg-cyan-400/10 px-3 py-1 text-xs uppercase tracking-[0.2em] text-cyan-300">
                    {String(item.priority ?? item.status ?? "active")}
                  </span>
                </div>
                <p className="mt-2 text-sm text-slate-400">Audience: {String(item.audience ?? "All staff")}</p>
                <p className="mt-2 text-sm text-slate-300">Publish date: {String(item.publish_date ?? "-")}</p>
              </div>
            ))}
            {!announcements.length ? <p className="text-sm text-slate-500">No announcements available.</p> : null}
          </div>
        </div>

        <div className="rounded-[2rem] border border-white/10 bg-white/5 p-6">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-white">Operational queue</h2>
              <p className="mt-2 text-sm text-slate-400">Open tasks and training actions from the portal.</p>
            </div>
            <Link href="/tasks" className="text-sm text-cyan-300">
              Open tasks
            </Link>
          </div>
          <div className="space-y-4">
            {openTasks.slice(0, 3).map((item) => (
              <div key={String(item.id)} className="flex items-start justify-between gap-4 rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                <div>
                  <h3 className="font-medium text-white">{String(item.title ?? "Task")}</h3>
                  <p className="mt-2 text-sm text-slate-400">Assigned to: {String(item.assigned_to ?? "HR team")}</p>
                </div>
                <div className="text-right text-sm">
                  <p className="text-cyan-300">{String(item.status ?? "Pending")}</p>
                  <p className="mt-2 text-slate-400">{String(item.due_date ?? "-")}</p>
                </div>
              </div>
            ))}
            {trainingAssignments.slice(0, 2).map((item) => (
              <div key={`training-${String(item.id)}`} className="flex items-start justify-between gap-4 rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                <div>
                  <h3 className="font-medium text-white">{String(item.title ?? "Training assignment")}</h3>
                  <p className="mt-2 text-sm text-slate-400">Assignee: {String(item.assignee_name ?? "-")}</p>
                </div>
                <div className="text-right text-sm">
                  <p className="text-cyan-300">{String(item.status ?? "Assigned")}</p>
                  <p className="mt-2 text-slate-400">{String(item.due_date ?? "-")}</p>
                </div>
              </div>
            ))}
            {!openTasks.length && !trainingAssignments.length ? <p className="text-sm text-slate-500">No pending work items.</p> : null}
          </div>
        </div>
      </section>
    </div>
  );
}
