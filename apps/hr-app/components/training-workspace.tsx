"use client";

import { useEffect, useMemo, useState } from "react";
import { BookOpen, CheckCircle2, ClipboardCheck, Plus, Video } from "lucide-react";
import { createResource, getApiErrorMessage, getCurrentUser, getResource, type HrRecord, updateResource } from "../lib/hr-client";
import { HrPortalHeader } from "./hr-portal-header";

export function TrainingWorkspace() {
  const trainingForm = { title: "", audience: "All Staff", delivery_mode: "Video", content_url: "", status: "Active" };
  const assignmentForm = { title: "", training_id: "", assignee_name: "", due_date: "", survey_url: "", status: "Assigned" };
  const surveyForm = { title: "", url: "", due_date: "", status: "Active" };
  const [library, setLibrary] = useState<HrRecord[]>([]);
  const [assignments, setAssignments] = useState<HrRecord[]>([]);
  const [completions, setCompletions] = useState<HrRecord[]>([]);
  const [surveys, setSurveys] = useState<HrRecord[]>([]);
  const [surveyAssignments, setSurveyAssignments] = useState<HrRecord[]>([]);
  const [surveyCompletions, setSurveyCompletions] = useState<HrRecord[]>([]);
  const [userName, setUserName] = useState("Platform Admin");
  const [error, setError] = useState("");
  const [trainingDraft, setTrainingDraft] = useState(trainingForm);
  const [assignmentDraft, setAssignmentDraft] = useState(assignmentForm);
  const [surveyDraft, setSurveyDraft] = useState(surveyForm);

  async function load() {
    try {
      const [trainingData, assignmentData, completionData, surveyData, surveyAssignmentData, surveyCompletionData, user] = await Promise.all([
        getResource("training"),
        getResource("training_assignments"),
        getResource("training_completions"),
        getResource("surveys"),
        getResource("survey_assignments"),
        getResource("survey_completions"),
        getCurrentUser()
      ]);
      setLibrary(trainingData);
      setAssignments(assignmentData);
      setCompletions(completionData);
      setSurveys(surveyData);
      setSurveyAssignments(surveyAssignmentData);
      setSurveyCompletions(surveyCompletionData);
      setUserName(user.fullName);
    } catch (err) {
      setError(getApiErrorMessage(err));
    }
  }

  useEffect(() => { void load(); }, []);

  const completionByAssignment = useMemo(() => Object.fromEntries(completions.map((item) => [Number(item.assignment_id), item])), [completions]);
  const surveyCompletionByAssignment = useMemo(() => new Set(surveyCompletions.map((item) => Number(item.assignment_id))), [surveyCompletions]);

  async function createTraining(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await createResource("training", trainingDraft);
      setTrainingDraft(trainingForm);
      await load();
    } catch (err) {
      setError(getApiErrorMessage(err));
    }
  }

  async function assignTraining(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await createResource("training_assignments", assignmentDraft);
      setAssignmentDraft(assignmentForm);
      await load();
    } catch (err) {
      setError(getApiErrorMessage(err));
    }
  }

  async function createSurvey(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await createResource("surveys", surveyDraft);
      setSurveyDraft(surveyForm);
      await load();
    } catch (err) {
      setError(getApiErrorMessage(err));
    }
  }

  async function markComplete(assignment: HrRecord) {
    try {
      const existing = completionByAssignment[Number(assignment.id)];
      const payload = {
        assignment_id: String(assignment.id),
        user_name: userName,
        progress_percent: "100",
        completed_on: new Date().toISOString(),
        last_position_seconds: "0"
      };

      if (existing) {
        await updateResource("training_completions", Number(existing.id), payload);
      } else {
        await createResource("training_completions", payload);
      }

      await updateResource("training_assignments", Number(assignment.id), {
        title: String(assignment.title ?? ""),
        training_id: String(assignment.training_id ?? ""),
        assignee_name: String(assignment.assignee_name ?? ""),
        due_date: String(assignment.due_date ?? ""),
        survey_url: String(assignment.survey_url ?? ""),
        status: "Completed"
      });
      await load();
    } catch (err) {
      setError(getApiErrorMessage(err));
    }
  }

  async function markSurveyComplete(assignment: HrRecord) {
    try {
      await createResource("survey_completions", {
        assignment_id: String(assignment.id),
        user_name: userName,
        completed_on: new Date().toISOString()
      });
      await updateResource("survey_assignments", Number(assignment.id), {
        title: String(assignment.title ?? ""),
        survey_id: String(assignment.survey_id ?? ""),
        assignee_name: String(assignment.assignee_name ?? ""),
        due_date: String(assignment.due_date ?? ""),
        status: "Completed"
      });
      await load();
    } catch (err) {
      setError(getApiErrorMessage(err));
    }
  }

  return (
    <div>
      <HrPortalHeader title="Training and Survey Workflow" description="Restored training library, assignment, and completion tracking flows inspired by the original SPFx portal." breadcrumb="Training" />
      {error ? <p className="mb-6 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</p> : null}
      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-5"><p className="text-sm text-slate-400">Active training items</p><p className="mt-3 text-3xl font-semibold text-white">{library.length}</p></div>
        <div className="rounded-3xl border border-white/10 bg-white/5 p-5"><p className="text-sm text-slate-400">Assignments</p><p className="mt-3 text-3xl font-semibold text-white">{assignments.length}</p></div>
        <div className="rounded-3xl border border-white/10 bg-white/5 p-5"><p className="text-sm text-slate-400">Survey completions</p><p className="mt-3 text-3xl font-semibold text-white">{surveyCompletions.length}</p></div>
      </section>
      <section className="mt-8 grid gap-8 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-8">
          <form onSubmit={createTraining} className="rounded-[2rem] border border-white/10 bg-slate-900/60 p-6">
            <div className="mb-5 flex items-center gap-3"><div className="rounded-2xl bg-cyan-400/10 p-3 text-cyan-300"><Video className="h-5 w-5" /></div><div><h2 className="text-xl font-semibold text-white">Create training item</h2><p className="mt-1 text-sm text-slate-400">Build the content library used by assignments.</p></div></div>
            <div className="space-y-4">{Object.entries(trainingDraft).map(([key, value]) => <div key={key}><label className="mb-2 block text-sm capitalize text-slate-300">{key.replaceAll("_", " ")}</label><input value={value} onChange={(event) => setTrainingDraft((current) => ({ ...current, [key]: event.target.value }))} className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-sm text-white" /></div>)}</div>
            <button className="mt-4 w-full rounded-2xl bg-cyan-400 px-4 py-3 font-medium text-slate-950">Create training</button>
          </form>
          <form onSubmit={assignTraining} className="rounded-[2rem] border border-white/10 bg-slate-900/60 p-6">
            <div className="mb-5 flex items-center gap-3"><div className="rounded-2xl bg-cyan-400/10 p-3 text-cyan-300"><BookOpen className="h-5 w-5" /></div><div><h2 className="text-xl font-semibold text-white">Assign training</h2><p className="mt-1 text-sm text-slate-400">Set assignee, due date, and linked survey URL.</p></div></div>
            <div className="space-y-4">{Object.entries(assignmentDraft).map(([key, value]) => <div key={key}><label className="mb-2 block text-sm capitalize text-slate-300">{key.replaceAll("_", " ")}</label><input value={value} onChange={(event) => setAssignmentDraft((current) => ({ ...current, [key]: event.target.value }))} className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-sm text-white" /></div>)}</div>
            <button className="mt-4 w-full rounded-2xl bg-cyan-400 px-4 py-3 font-medium text-slate-950">Assign training</button>
          </form>
          <form onSubmit={createSurvey} className="rounded-[2rem] border border-white/10 bg-slate-900/60 p-6">
            <div className="mb-5 flex items-center gap-3"><div className="rounded-2xl bg-cyan-400/10 p-3 text-cyan-300"><ClipboardCheck className="h-5 w-5" /></div><div><h2 className="text-xl font-semibold text-white">Create survey</h2><p className="mt-1 text-sm text-slate-400">Set up post-training quiz or feedback tracking.</p></div></div>
            <div className="space-y-4">{Object.entries(surveyDraft).map(([key, value]) => <div key={key}><label className="mb-2 block text-sm capitalize text-slate-300">{key.replaceAll("_", " ")}</label><input value={value} onChange={(event) => setSurveyDraft((current) => ({ ...current, [key]: event.target.value }))} className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-sm text-white" /></div>)}</div>
            <button className="mt-4 w-full rounded-2xl bg-cyan-400 px-4 py-3 font-medium text-slate-950">Create survey</button>
          </form>
        </div>
        <div className="space-y-8">
          <div className="rounded-[2rem] border border-white/10 bg-white/5 p-6">
            <h2 className="text-xl font-semibold text-white">Training assignments</h2>
            <div className="mt-5 space-y-4">
              {assignments.map((assignment) => {
                const completion = completionByAssignment[Number(assignment.id)];
                return (
                  <article key={String(assignment.id)} className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                    <div className="flex items-start justify-between gap-4"><div><h3 className="font-medium text-white">{String(assignment.title ?? "Assignment")}</h3><p className="mt-2 text-sm text-slate-400">Assignee: {String(assignment.assignee_name ?? "-")}</p><p className="mt-1 text-sm text-slate-400">Due: {String(assignment.due_date ?? "-")}</p></div><span className="rounded-full bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.2em] text-slate-300">{String(assignment.status ?? "Assigned")}</span></div>
                    <p className="mt-3 text-sm text-slate-300">Survey URL: {String(assignment.survey_url ?? "Not linked")}</p>
                    <p className="mt-3 text-sm text-cyan-300">Progress: {String(completion?.progress_percent ?? 0)}%</p>
                    {String(assignment.status ?? "") !== "Completed" ? <button onClick={() => void markComplete(assignment)} className="mt-4 inline-flex items-center gap-2 rounded-full bg-cyan-400 px-4 py-2 text-sm font-medium text-slate-950"><CheckCircle2 className="h-4 w-4" />Mark training complete</button> : null}
                  </article>
                );
              })}
            </div>
          </div>
          <div className="rounded-[2rem] border border-white/10 bg-white/5 p-6">
            <h2 className="text-xl font-semibold text-white">Survey assignments</h2>
            <div className="mt-5 space-y-4">
              {surveyAssignments.map((assignment) => (
                <article key={String(assignment.id)} className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                  <div className="flex items-start justify-between gap-4"><div><h3 className="font-medium text-white">{String(assignment.title ?? "Survey assignment")}</h3><p className="mt-2 text-sm text-slate-400">Assignee: {String(assignment.assignee_name ?? "-")}</p><p className="mt-1 text-sm text-slate-400">Due: {String(assignment.due_date ?? "-")}</p></div><span className="rounded-full bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.2em] text-slate-300">{String(assignment.status ?? "Assigned")}</span></div>
                  {!surveyCompletionByAssignment.has(Number(assignment.id)) ? <button onClick={() => void markSurveyComplete(assignment)} className="mt-4 inline-flex items-center gap-2 rounded-full bg-cyan-400 px-4 py-2 text-sm font-medium text-slate-950"><CheckCircle2 className="h-4 w-4" />Record survey completion</button> : <p className="mt-4 text-sm text-cyan-300">Survey completion recorded.</p>}
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
