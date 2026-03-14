import type { SessionUser } from "@vlworkhub/types";
import type { HrAssignment, HrRecord, HrUser } from "./hr-client";

export type EffectiveHrRole = "admin" | "manager" | "employee";

export function canCreateForHrRole(role: EffectiveHrRole) {
  return role === "admin";
}

export function canEditForHrRole(role: EffectiveHrRole) {
  return role === "admin";
}

export function canActOnOwnAssignments(role: EffectiveHrRole) {
  return role === "admin" || role === "manager" || role === "employee";
}

export function formatHrRoleLabel(role: EffectiveHrRole) {
  if (role === "admin") return "HR Admin";
  if (role === "manager") return "Manager";
  return "Employee";
}

export function getVisibleHrUserNames(role: EffectiveHrRole, currentUserId: string, currentUserName: string, assignments: HrAssignment[], users: HrUser[]) {
  if (role === "admin") {
    return users.map((user) => user.fullName);
  }

  if (role === "manager") {
    const visibleUserIds = new Set(
      assignments
        .filter((assignment) => String(assignment.manager_id ?? "") === currentUserId)
        .map((assignment) => String(assignment.user_id))
    );

    const visibleNames = users
      .filter((user) => visibleUserIds.has(user.id))
      .map((user) => user.fullName)
      .filter(Boolean);

    if (currentUserName && !visibleNames.includes(currentUserName)) {
      visibleNames.unshift(currentUserName);
    }

    return visibleNames;
  }

  return currentUserName ? [currentUserName] : [];
}

export function isHrAdmin(user: SessionUser | null) {
  const roles = user?.roles || (user?.role ? [user.role] : []);
  return roles.some((role) => role === "Admin" || role === "HR");
}

export function isHrManager(user: SessionUser | null) {
  const roles = user?.roles || (user?.role ? [user.role] : []);
  return roles.some((role) => role === "Admin" || role === "HR" || role === "Manager");
}

export function splitAssignees(value: string | number | null | undefined) {
  return String(value ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

export function joinAssignees(names: string[]) {
  return names.join(", ");
}

export function getFullNameFromRecord(record: HrRecord) {
  return [String(record.first_name ?? "").trim(), String(record.last_name ?? "").trim()].filter(Boolean).join(" ");
}

export function findUserByName(users: HrUser[], name: string) {
  return users.find((user) => user.fullName.toLowerCase() === name.toLowerCase());
}

export function formatDate(value: string | number | null | undefined) {
  const raw = String(value ?? "");
  if (!raw) return "-";
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  return parsed.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function isOverdue(value: string | number | null | undefined) {
  const raw = String(value ?? "");
  if (!raw) return false;
  const parsed = new Date(raw);
  return !Number.isNaN(parsed.getTime()) && parsed.getTime() < Date.now();
}
