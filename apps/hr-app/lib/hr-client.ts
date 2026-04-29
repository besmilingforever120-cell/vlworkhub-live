"use client";

import { platformLinks } from "@vlworkhub/config";
import type { SessionUser } from "@vlworkhub/types";

export type HrResourceName =
  | "users"
  | "announcements"
  | "tasks"
  | "task_assignments"
  | "task_completion"
  | "task_user_states"
  | "training"
  | "training_assignments"
  | "training_completions"
  | "surveys"
  | "survey_assignments"
  | "survey_completions"
  | "documents"
  | "document_signatures"
  | "hr_user_roles";

export type HrRecord = Record<string, string | number | null>;

export type HrUser = {
  id: string;
  fullName: string;
  email: string;
  roles: string[];
  status: string;
};

export type HrNotification = {
  type: "task" | "training" | "survey" | "document";
  title: string;
  link: string;
  created_at: string;
};

export type HrNotificationSummary = {
  count: number;
  items: HrNotification[];
};

export type HrDashboardSummary = {
  documents: number;
  training: number;
  tasks: number;
  surveys: number;
};

export type HrAssignment = {
  id: number;
  user_id: string;
  hr_role: "ADMIN" | "MANAGER" | "EMPLOYEE";
  manager_id: string | null;
  department_id?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type HrRoleSummary = {
  userId: string;
  role: "admin" | "manager" | "employee";
  managerId: string | null;
};

export type PlatformUserRecord = {
  id: string;
  name: string;
  email: string;
  department_id?: string | null;
  department_name?: string | null;
};

export type DepartmentRecord = {
  id: string;
  organization_id?: string;
  name: string;
  department_type?: "Community housing" | "Program";
  address?: string | null;
  manager_id?: string | null;
  manager_name?: string | null;
  manager_email?: string | null;
  created_at?: string | null;
};

let hrRoleCache: Promise<HrRoleSummary> | null = null;

export class ApiOfflineError extends Error {
  constructor() {
    super(`The HR portal cannot reach the API at ${platformLinks.api}. Start the API server and try again.`);
    this.name = "ApiOfflineError";
  }
}

export function getApiErrorMessage(error: unknown) {
  if (error instanceof ApiOfflineError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "The HR portal request failed.";
}

export function getFriendlyUploadValidationMessage(error: unknown) {
  const message = getApiErrorMessage(error);
  const normalized = message.toLowerCase();

  if (normalized.includes("signed document payload must be application/pdf")) {
    return "The signed document format is not supported. Please submit the signed document as a PDF.";
  }

  if (
    normalized.includes("unsupported file type") ||
    normalized.includes("file extension is required") ||
    normalized.includes("file extension") ||
    normalized.includes("invalid filedata payload") ||
    normalized.includes("invalid onboarding filedata payload")
  ) {
    return "This file type is not supported. Please upload a PDF, Word document, Excel file, JPG, PNG, or TXT file.";
  }

  if (normalized.includes("invalid signedfileurl payload")) {
    return "The signed document could not be processed. Please try signing again.";
  }

  return message;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);

  let response: Response;

  try {
    response = await fetch(`${platformLinks.api}${path}`, {
      ...init,
      credentials: "include",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers || {})
      }
    });
  } catch (error) {
    clearTimeout(timer);
    if (error instanceof TypeError || (error instanceof Error && error.name === "AbortError")) {
      throw new ApiOfflineError();
    }
    throw error;
  }

  clearTimeout(timer);

  if (!response.ok) {
    let detail = "Request failed";
    try {
      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        const body = await response.json();
        detail = String(body.message || body.error || detail);
      } else {
        detail = await response.text();
      }
    } catch {
      detail = "Request failed";
    }

    throw new Error(detail || "Request failed");
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export function invalidateHrRoleCache() {
  hrRoleCache = null;
}

export async function getCurrentUser() {
  const data = await request<{ user: SessionUser }>("/auth/me");
  return data.user;
}

export async function getNotifications() {
  return request<HrNotificationSummary>("/notifications");
}

export async function getDashboardSummary() {
  return request<HrDashboardSummary>("/hr/dashboard");
}

export async function getMyHrRole(forceRefresh = false) {
  if (forceRefresh || !hrRoleCache) {
    hrRoleCache = request<HrRoleSummary>("/hr/my-role");
  }
  return hrRoleCache;
}

export async function getPlatformUsers() {
  return request<{ items: PlatformUserRecord[] }>("/api/users");
}

export async function getDepartments() {
  return request<{ items: DepartmentRecord[] }>("/api/departments");
}

export async function getHrAssignments() {
  return request<{ items: HrAssignment[] }>("/api/hr/roles");
}

export async function createHrAssignment(payload: { userId: string; role: "ADMIN" | "MANAGER" | "EMPLOYEE"; managerId: string | null; departmentId?: string | null }) {
  console.log("[HR Admin] POST /api/hr/roles payload", payload);
  const response = await request<{ success: true; item: HrAssignment }>("/api/hr/roles", {
    method: "POST",
    body: JSON.stringify(payload)
  });
  invalidateHrRoleCache();
  return response;
}

export async function updateHrAssignment(userId: string, payload: { role: "ADMIN" | "MANAGER" | "EMPLOYEE"; managerId: string | null; departmentId?: string | null }) {
  console.log("[HR Admin] PUT /api/hr/roles/:userId payload", { userId, ...payload });
  const response = await request<{ success: true; item: HrAssignment }>(`/api/hr/roles/${userId}`, {
    method: "PUT",
    body: JSON.stringify(payload)
  });
  invalidateHrRoleCache();
  return response;
}

export async function deleteHrAssignment(userId: string) {
  console.log("[HR Admin] DELETE /api/hr/roles/:userId", { userId });
  const response = await request<{ success: true }>(`/api/hr/roles/${userId}`, {
    method: "DELETE"
  });
  invalidateHrRoleCache();
  return response;
}

export async function getResource(resource: HrResourceName) {
  const data = await request<{ items: HrRecord[] }>(`/resources/${resource}`);
  return data.items;
}

export async function createResource(resource: HrResourceName, payload: Record<string, string | null>) {
  return request<{ id: number }>(`/resources/${resource}`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function updateResource(resource: HrResourceName, id: number, payload: Record<string, string | null>) {
  return request<{ success: true }>(`/resources/${resource}/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload)
  });
}

export async function deleteResource(resource: HrResourceName, id: number) {
  return request<{ success: true }>(`/resources/${resource}/${id}`, {
    method: "DELETE"
  });
}

export async function getSharedUsers() {
  const [userData, session] = await Promise.all([getPlatformUsers(), getCurrentUser()]);
  const currentUser: HrUser = {
    id: session.id,
    fullName: session.fullName,
    email: session.email,
    roles: session.roles,
    status: "active"
  };

  const mapped = (userData.items || []).map((item) => ({
    id: String(item.id ?? ""),
    fullName: String(item.name ?? "User").trim() || String(item.email ?? "User"),
    email: String(item.email ?? ""),
    roles: session.roles,
    status: "active"
  }));

  const existing = mapped.find((item) => item.email.toLowerCase() === currentUser.email.toLowerCase() || item.id === currentUser.id);
  return existing ? mapped : [currentUser, ...mapped];
}



export async function archiveTask(id: number) {  return request<{ success: true }>(`/resources/tasks/${id}/archive`, {
    method: "POST"
  });
}

export async function getArchivedTasks() {
  return request<{ items: HrRecord[] }>("/resources/tasks/archived");
}







export type HrDocumentRecord = {
  created_by?: string | null;
  created_at?: string | null;
  signed_at?: string | null;
  id: number;
  file_name: string;
  file_url: string | null;
  category: string;
  category_other: string | null;
  department_id: string | null;
  department_name: string | null;
  description: string | null;
  due_date: string | null;
  requires_signature: boolean;
  status: string | null;
  sensitive: boolean;
  allow_download: boolean;
  assigned_user_ids: string[];
  assigned_user_names: string[];
  direct_user_ids: string[];
  direct_user_names: string[];
  assigned_department_ids: string[];
  assigned_department_names: string[];
  all_staff: boolean;
  signed_user_ids: string[];
  signed_user_names: string[];
  is_completed: boolean;
  can_sign: boolean;
  can_complete: boolean;
  can_view_actions: boolean;
};

export type HrSignedDocumentFileRecord = {
  id: number;
  document_id: number;
  user_id: string | null;
  signer_name: string;
  signer_email: string;
  document_name: string;
  document_status: string;
  signed_at: string | null;
  signature_id: string | null;
  signed_file_url: string | null;
  archived: boolean;
};

export type HrOnboardingFileRecord = {
  id: string;
  user_id?: string;
  user_name?: string;
  user_email?: string;
  file_name: string;
  original_file_name: string;
  document_type: string;
  uploaded_at: string;
  expiry_date?: string | null;
  file_url: string;
};

export async function getHrDocuments() {

  return request<{ items: HrDocumentRecord[] }>("/hr/documents");
}

export async function getHrOnboardingFiles() {
  return request<{ items: HrOnboardingFileRecord[] }>("/hr/onboarding/files");
}

export async function uploadHrOnboardingFiles(payload: {
  files: Array<{
    fileName: string;
    fileData: string;
    documentType: string;
    expiryDate?: string | null;
  }>;
}) {
  return request<{ items: HrOnboardingFileRecord[] }>("/hr/onboarding/files", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function updateHrOnboardingFile(fileId: string, payload: {
  documentType?: string;
  expiryDate?: string | null;
}) {
  return request<{ item: HrOnboardingFileRecord }>("/hr/onboarding/files/item", {
    method: "PUT",
    body: JSON.stringify({
      fileId,
      documentType: payload.documentType,
      expiryDate: payload.expiryDate
    })
  });
}

export async function deleteHrOnboardingFile(fileId: string) {
  const encodedFileId = encodeURIComponent(fileId);
  return request<{ success: true }>(`/hr/onboarding/files/item?fileId=${encodedFileId}`, {
    method: "DELETE"
  });
}

export async function getAdminHrOnboardingFiles(userId: string) {
  const encodedUserId = encodeURIComponent(userId);
  return request<{ items: HrOnboardingFileRecord[] }>(`/hr/onboarding/files/admin?userId=${encodedUserId}`);
}

export async function updateAdminHrOnboardingFile(userId: string, fileId: string, payload: {
  documentType?: string;
  expiryDate?: string | null;
}) {
  return request<{ item: HrOnboardingFileRecord }>("/hr/onboarding/files/admin/item", {
    method: "PUT",
    body: JSON.stringify({
      userId,
      fileId,
      documentType: payload.documentType,
      expiryDate: payload.expiryDate
    })
  });
}

export async function deleteAdminHrOnboardingFile(userId: string, fileId: string) {
  const encodedUserId = encodeURIComponent(userId);
  const encodedFileId = encodeURIComponent(fileId);
  return request<{ success: true }>(`/hr/onboarding/files/admin/item?userId=${encodedUserId}&fileId=${encodedFileId}`, {
    method: "DELETE"
  });
}

export async function getHrSignedDocumentFiles() {
  return request<{ items: HrSignedDocumentFileRecord[] }>("/hr/documents/signed-files");
}

export async function createHrDocument(payload: {
  title?: string;
  fileName: string;
  fileUrl?: string | null;
  fileData?: string | null;
  category: string;
  categoryOther?: string | null;
  departmentId?: string | null;
  description?: string | null;
  dueDate?: string | null;
  requiresSignature: boolean;
  status: string;
  sensitive: boolean;
  allowDownload?: boolean;
  userIds?: string[];
  departmentIds?: string[];
  allStaff?: boolean;
}) {
  return request<{ id: number }>("/hr/documents", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function signHrDocument(id: number, payload?: { initials?: string; signatureData?: string | null; signatureId?: string; signedAt?: string; signedBy?: string; assignedBy?: string; signedFileUrl?: string | null }) {
  return request<{ success: true }>(`/hr/documents/${id}/sign`, {
    method: "POST",
    body: JSON.stringify(payload || {})
  });
}

export async function updateHrDocument(id: number, payload: {
  fileName?: string;
  category?: string;
  categoryOther?: string | null;
  description?: string | null;
  dueDate?: string | null;
  requiresSignature?: boolean;
  status?: string;
  sensitive?: boolean;
  allowDownload?: boolean;
  userIds?: string[];
  departmentIds?: string[];
  allStaff?: boolean;
  fileData?: string | null;
}) {
  return request<{ success: true }>(`/hr/documents/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload)
  });
}

export async function archiveHrDocument(id: number) {
  return request<{ success: true }>(`/hr/documents/${id}/archive`, {
    method: "POST"
  });
}

export async function deleteHrDocument(id: number) {
  return request<{ success: true }>(`/hr/documents/${id}`, {
    method: "DELETE"
  });
}

export async function completeHrDocument(id: number) {
  return request<{ success: true }>(`/hr/documents/${id}/complete`, {
    method: "POST"
  });
}





export function getHrDocumentDownloadUrl(id: number) {
  return `${platformLinks.api}/hr/documents/${id}/download`;
}


export async function getUsers() {
  return getPlatformUsers();
}





