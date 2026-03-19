import type { SessionUser } from "@vlworkhub/types";
import type { DepartmentRecord, HrRecord, PlatformUserRecord } from "./hr-client";
import { splitAssignees } from "./workflow-utils";

export type TrainingAssignmentRow = HrRecord & {
  id: number;
  training_id?: string | number | null;
  training_name?: string | number | null;
  assignee_name?: string | number | null;
  due_date?: string | number | null;
  survey_url?: string | number | null;
  status?: string | number | null;
};

export type TrainingLibraryRow = HrRecord & {
  id: number;
  training_name?: string | number | null;
  video_iframe_link?: string | number | null;
  quiz_iframe_link?: string | number | null;
  status?: string | number | null;
};

export function getQuizUrl(training: TrainingLibraryRow | undefined) {
  return String(training?.quiz_iframe_link ?? "").trim();
}

export function parseAssigneeTargets(value: string | number | null | undefined, users: PlatformUserRecord[], departments: DepartmentRecord[]) {
  const tokens = splitAssignees(value);
  const allStaff = tokens.includes("All Staff");
  const departmentIds = tokens.filter((token) => token.startsWith("Department: ")).map((token) => token.replace("Department: ", "").trim()).map((name) => departments.find((department) => department.name === name)?.id).filter((candidate): candidate is string => Boolean(candidate));
  const userIds = tokens.filter((token) => token && token !== "All Staff" && !token.startsWith("Department: ")).map((name) => users.find((user) => (user.name || user.email) === name)?.id).filter((candidate): candidate is string => Boolean(candidate));
  return { allStaff, userIds, departmentIds };
}

export function buildAssignmentTokens(form: { allStaff: boolean; userIds: string[]; departmentIds: string[] }, users: PlatformUserRecord[], departments: DepartmentRecord[]) {
  if (form.allStaff) return ["All Staff"];
  const userTokens = form.userIds.map((id) => users.find((candidate) => candidate.id === id)).filter((candidate): candidate is PlatformUserRecord => Boolean(candidate)).map((candidate) => candidate.name || candidate.email);
  const departmentTokens = form.departmentIds.map((id) => departments.find((candidate) => candidate.id === id)).filter((candidate): candidate is DepartmentRecord => Boolean(candidate)).map((candidate) => `Department: ${candidate.name}`);
  return [...userTokens, ...departmentTokens];
}

export function buildAssignmentTargetSummary(assignment: TrainingAssignmentRow) {
  const tokens = splitAssignees(assignment.assignee_name);
  if (!tokens.length) return "-";
  if (tokens.length <= 3) return tokens.join(", ");
  const userCount = tokens.filter((token) => token !== "All Staff" && !token.startsWith("Department: ")).length;
  const departmentCount = tokens.filter((token) => token.startsWith("Department: ")).length;
  const parts: string[] = [];
  if (tokens.includes("All Staff")) parts.push("All Staff");
  if (userCount) parts.push(`${userCount} user${userCount === 1 ? "" : "s"}`);
  if (departmentCount) parts.push(`${departmentCount} department${departmentCount === 1 ? "" : "s"}`);
  return parts.join(", ");
}

export function getCurrentPlatformUser(user: SessionUser | null, users: PlatformUserRecord[]) {
  if (!user) return null;
  return users.find((candidate) => candidate.id === user.id || candidate.email.toLowerCase() === user.email.toLowerCase()) || null;
}

export function getVisibleDepartmentNames(visibleNames: string[], users: PlatformUserRecord[], currentPlatformUser: PlatformUserRecord | null) {
  const names = new Set<string>();
  users.forEach((candidate) => {
    if (visibleNames.includes(candidate.name || candidate.email) && candidate.department_name) names.add(candidate.department_name);
  });
  if (currentPlatformUser?.department_name) names.add(currentPlatformUser.department_name);
  return Array.from(names);
}

export function isAssignmentVisible(assignment: TrainingAssignmentRow, hrRole: "admin" | "manager" | "employee", currentUser: SessionUser | null, currentPlatformUser: PlatformUserRecord | null, visibleNames: string[], visibleDepartmentNames: string[]) {
  if (hrRole === "admin") return true;
  const tokens = splitAssignees(assignment.assignee_name);
  const currentName = currentUser?.fullName || "";
  const currentDepartment = currentPlatformUser?.department_name || "";
  if (tokens.includes("All Staff")) return true;
  if (currentName && tokens.includes(currentName)) return true;
  if (currentDepartment && tokens.includes(`Department: ${currentDepartment}`)) return true;
  if (hrRole === "manager") {
    if (tokens.some((token) => visibleNames.includes(token))) return true;
    if (tokens.some((token) => token.startsWith("Department: ") && visibleDepartmentNames.includes(token.replace("Department: ", "").trim()))) return true;
  }
  return false;
}

export function isAssignmentTargetedToUser(assignment: TrainingAssignmentRow, currentUser: SessionUser | null, currentPlatformUser: PlatformUserRecord | null) {
  const tokens = splitAssignees(assignment.assignee_name);
  const currentName = currentUser?.fullName || "";
  const currentDepartment = currentPlatformUser?.department_name || "";
  return Boolean(tokens.includes("All Staff") || (currentName && tokens.includes(currentName)) || (currentDepartment && tokens.includes(`Department: ${currentDepartment}`)));
}

export function getCompletedAssignmentIds(completions: HrRecord[]) {
  return new Set(completions.filter((item) => Number(item.progress_percent ?? 0) >= 100 || String(item.completed_on ?? "")).map((item) => String(item.assignment_id ?? "")));
}

export function getAssignmentStatus(assignment: TrainingAssignmentRow, completedAssignmentIds: Set<string>) {
  if (String(assignment.status ?? "") === "Archived") return "Archived";
  if (completedAssignmentIds.has(String(assignment.id)) || String(assignment.status ?? "") === "Completed") return "Completed";
  return String(assignment.status ?? "Assigned") || "Assigned";
}

