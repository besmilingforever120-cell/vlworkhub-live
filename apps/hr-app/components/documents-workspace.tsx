"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, FileSignature, FolderUp, Lock, Pencil, Plus, Save, Search, Shield, Trash2, Upload, Users, X } from "lucide-react";
import type { SessionUser } from "@vlworkhub/types";
import {
  archiveHrDocument,
  createHrDocument,
  deleteHrDocument,
  getApiErrorMessage,
  getCurrentUser,
  getDepartments,
  getHrAssignments,
  getHrDocumentDownloadUrl,
  getHrDocuments,
  getPlatformUsers,
  updateHrDocument,
  type DepartmentRecord,
  type HrAssignment,
  type HrDocumentRecord,
  type PlatformUserRecord
} from "../lib/hr-client";
import { useHrRole } from "../lib/use-hr-role";
import { canCreateForHrRole, formatDate, formatHrRoleLabel } from "../lib/workflow-utils";

type DocumentForm = {
  category: string;
  categoryOther: string;
  dueDate: string;
  description: string;
  assignedUserIds: string[];
  assignedDepartmentIds: string[];
  allStaff: boolean;
  requiresSignature: boolean;
  status: string;
  sensitive: boolean;
  allowDownload: boolean;
};

type ValidationState = Partial<Record<"file" | "assignments" | "categoryOther" | "signature", string>>;
type DocumentViewerRecord = HrDocumentRecord;
type ViewerRole = "ADMIN" | "MANAGER" | "EMPLOYEE";

type ViewerContext = {
  id: string;
  role: ViewerRole;
  reportIds: string[];
};

const categoryOptions = ["Policy", "Form", "Contract", "Information", "Training", "Other"] as const;
const statusOptions = ["Pending Signature", "In Progress", "Signed"] as const;

function emptyForm(): DocumentForm {
  return {
    category: "Policy",
    categoryOther: "",
    dueDate: "",
    description: "",
    assignedUserIds: [],
    assignedDepartmentIds: [],
    allStaff: false,
    requiresSignature: true,
    status: "Pending Signature",
    sensitive: false,
    allowDownload: false
  };
}

function normalizeRole(role: string): ViewerRole {
  if (role === "admin") return "ADMIN";
  if (role === "manager") return "MANAGER";
  return "EMPLOYEE";
}

function categoryLabel(document: DocumentViewerRecord) {
  if (document.category === "Other" && document.category_other) {
    return `Other: ${document.category_other}`;
  }
  return document.category;
}

function checkboxRow(label: string, checked: boolean, onChange: (checked: boolean) => void, disabled = false) {
  return (
    <label className={`legacy-checkbox-row ${disabled ? "is-disabled" : ""}`}>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} disabled={disabled} />
      <span>{label}</span>
    </label>
  );
}

function getDocumentStatus(document: DocumentViewerRecord) {
  const normalized = String(document.status || "").trim().toLowerCase();
  if (normalized === "archived") return "archived" as const;
  if (document.is_completed || normalized === "signed") return "signed" as const;
  return "pending" as const;
}

function getStatusBadgeClass(status: "pending" | "signed" | "archived") {
  if (status === "signed") return "legacy-status completed";
  if (status === "archived") return "legacy-status archived";
  return "legacy-status";
}

function assignmentSummary(document: DocumentViewerRecord) {
  const tokens = [
    ...(document.direct_user_names || []),
    ...(document.assigned_department_names || []).map((name) => `Department: ${name}`),
    ...(document.all_staff ? ["All Staff"] : [])
  ].filter(Boolean);

  return tokens.length ? tokens.join(", ") : "-";
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

export function DocumentsWorkspace() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const router = useRouter();
  const { role: hrRole } = useHrRole();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [users, setUsers] = useState<PlatformUserRecord[]>([]);
  const [departments, setDepartments] = useState<DepartmentRecord[]>([]);
  const [assignments, setAssignments] = useState<HrAssignment[]>([]);
  const [documents, setDocuments] = useState<DocumentViewerRecord[]>([]);
  const [query, setQuery] = useState("");
  const [editingDocument, setEditingDocument] = useState<DocumentViewerRecord | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showUserPicker, setShowUserPicker] = useState(false);
  const [showDepartmentPicker, setShowDepartmentPicker] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [departmentSearch, setDepartmentSearch] = useState("");
  const [draftUserIds, setDraftUserIds] = useState<string[]>([]);
  const [draftDepartmentIds, setDraftDepartmentIds] = useState<string[]>([]);
  const [form, setForm] = useState<DocumentForm>(emptyForm());
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [validationErrors, setValidationErrors] = useState<ValidationState>({});
  const [error, setError] = useState("");

  async function load() {
    setError("");
    const [sessionResult, usersResult, departmentsResult, documentsResult, assignmentsResult] = await Promise.allSettled([
      getCurrentUser(),
      getPlatformUsers(),
      getDepartments(),
      getHrDocuments(),
      getHrAssignments()
    ]);

    if (sessionResult.status === "fulfilled") setUser(sessionResult.value);
    else console.error("[Documents] GET /auth/me failed", sessionResult.reason);

    if (usersResult.status === "fulfilled") setUsers(usersResult.value.items || []);
    else {
      console.error("[Documents] GET /api/users failed", usersResult.reason);
      setUsers([]);
    }

    if (departmentsResult.status === "fulfilled") setDepartments(departmentsResult.value.items || []);
    else {
      console.error("[Documents] GET /api/departments failed", departmentsResult.reason);
      setDepartments([]);
    }

    if (assignmentsResult.status === "fulfilled") setAssignments(assignmentsResult.value.items || []);
    else {
      console.error("[Documents] GET /api/hr/roles failed", assignmentsResult.reason);
      setAssignments([]);
    }

    if (documentsResult.status === "fulfilled") {
      const items = (documentsResult.value.items || []) as DocumentViewerRecord[];
      setDocuments(items);
      setEditingDocument((current) => current ? items.find((item) => Number(item.id) === Number(current.id)) || null : null);
    } else {
      console.error("[Documents] GET /hr/documents failed", documentsResult.reason);
      setDocuments([]);
      setError(getApiErrorMessage(documentsResult.reason));
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const canManage = canCreateForHrRole(hrRole);
  const viewer = useMemo<ViewerContext | null>(() => {
    if (!user) return null;
    return {
      id: user.id,
      role: normalizeRole(hrRole),
      reportIds: assignments.filter((assignment) => String(assignment.manager_id || "") === user.id).map((assignment) => String(assignment.user_id))
    };
  }, [assignments, hrRole, user]);

  function getEffectiveAssignedUserIds(document: DocumentViewerRecord) {
    const directIds = (document.direct_user_ids || []).map(String);
    const departmentIds = new Set((document.assigned_department_ids || []).map(String));
    const departmentNames = new Set((document.assigned_department_names || []).map(String));
    const effective = new Set<string>(directIds);

    if (document.all_staff) {
      users.forEach((candidate) => effective.add(candidate.id));
    }

    users.forEach((candidate) => {
      const userDepartmentId = String(candidate.department_id || "");
      const userDepartmentName = String(candidate.department_name || "");
      if ((userDepartmentId && departmentIds.has(userDepartmentId)) || (userDepartmentName && departmentNames.has(userDepartmentName))) {
        effective.add(candidate.id);
      }
    });

    return Array.from(effective);
  }

  function isAssignedToCurrentUser(document: DocumentViewerRecord, currentViewer: ViewerContext) {
    return getEffectiveAssignedUserIds(document).includes(currentViewer.id);
  }

  function hasDirectReportAssignment(document: DocumentViewerRecord, currentViewer: ViewerContext) {
    const reportIds = new Set(currentViewer.reportIds);
    return getEffectiveAssignedUserIds(document).some((userId) => reportIds.has(userId));
  }

  function canViewDocument(document: DocumentViewerRecord, currentViewer: ViewerContext | null) {
    if (!currentViewer) return false;
    if (currentViewer.role === "ADMIN") return true;
    return isAssignedToCurrentUser(document, currentViewer) || hasDirectReportAssignment(document, currentViewer);
  }

  function canOpenDocument(document: DocumentViewerRecord, currentViewer: ViewerContext | null) {
    if (!currentViewer) return false;
    if (currentViewer.role === "ADMIN") return true;
    if (currentViewer.role === "MANAGER") {
      if (document.sensitive) return isAssignedToCurrentUser(document, currentViewer);
      return isAssignedToCurrentUser(document, currentViewer) || hasDirectReportAssignment(document, currentViewer);
    }
    return isAssignedToCurrentUser(document, currentViewer);
  }

  function canSignDocument(document: DocumentViewerRecord, currentViewer: ViewerContext | null) {
    if (!currentViewer) return false;
    return isAssignedToCurrentUser(document, currentViewer) && getDocumentStatus(document) === "pending";
  }

  const visibleDocuments = useMemo(() => {
    const items = documents.filter((document) => canViewDocument(document, viewer));
    if (!viewer) return [] as DocumentViewerRecord[];
    if (viewer.role === "ADMIN") return items;
    return items.filter((document) => getDocumentStatus(document) === "pending");
  }, [documents, viewer]);

  const filteredDocuments = useMemo(() => {
    const normalizedQuery = query.toLowerCase();
    return visibleDocuments.filter((document) => {
      const haystack = [document.file_name, categoryLabel(document), assignmentSummary(document), document.description || ""].join(" ").toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [query, visibleDocuments]);

  const activeDocuments = useMemo(() => filteredDocuments.filter((document) => getDocumentStatus(document) === "pending"), [filteredDocuments]);
  const activeDocumentsRequiringSignature = useMemo(() => activeDocuments.filter((document) => document.requires_signature), [activeDocuments]);
  const selectedUsers = useMemo(() => users.filter((candidate) => form.assignedUserIds.includes(candidate.id)), [form.assignedUserIds, users]);
  const selectedDepartments = useMemo(() => departments.filter((candidate) => form.assignedDepartmentIds.includes(candidate.id)), [departments, form.assignedDepartmentIds]);
  const filteredUserOptions = useMemo(() => users.filter((candidate) => `${candidate.name || ""} ${candidate.email || ""}`.toLowerCase().includes(userSearch.toLowerCase())), [userSearch, users]);
  const filteredDepartmentOptions = useMemo(() => departments.filter((candidate) => `${candidate.name || ""} ${candidate.address || ""}`.toLowerCase().includes(departmentSearch.toLowerCase())), [departmentSearch, departments]);

  function resetUploadModal() {
    setShowUploadModal(false);
    setShowUserPicker(false);
    setShowDepartmentPicker(false);
    setUserSearch("");
    setDepartmentSearch("");
    setDraftUserIds([]);
    setDraftDepartmentIds([]);
    setForm(emptyForm());
    setSelectedFiles([]);
    setEditingDocument(null);
    setValidationErrors({});
  }

  function handleFileChange(fileList: FileList | null) {
    setSelectedFiles(fileList ? Array.from(fileList) : []);
    setValidationErrors((current) => ({ ...current, file: undefined }));
  }

  function openUserPicker() {
    setDraftUserIds(form.assignedUserIds);
    setUserSearch("");
    setShowUserPicker(true);
  }

  function openDepartmentPicker() {
    setDraftDepartmentIds(form.assignedDepartmentIds);
    setDepartmentSearch("");
    setShowDepartmentPicker(true);
  }

  function startEditDocument(document: DocumentViewerRecord) {
    setEditingDocument(document);
    setForm({
      category: document.category || "Policy",
      categoryOther: document.category_other || "",
      dueDate: document.due_date ? String(document.due_date).slice(0, 10) : "",
      description: document.description || "",
      assignedUserIds: [...(document.direct_user_ids || [])],
      assignedDepartmentIds: [...(document.assigned_department_ids || [])],
      allStaff: Boolean(document.all_staff),
      requiresSignature: Boolean(document.requires_signature),
      status: document.status || "Pending Signature",
      sensitive: Boolean(document.sensitive),
      allowDownload: Boolean(document.allow_download)
    });
    setSelectedFiles([]);
    setValidationErrors({});
    setShowUploadModal(true);
  }

  async function submitDocument() {
    const nextErrors: ValidationState = {};
    if (!editingDocument && selectedFiles.length === 0) nextErrors.file = "Select at least one file to upload.";
    if (form.category === "Other" && !form.categoryOther.trim()) nextErrors.categoryOther = "Specify the document category.";
    if (!form.allStaff && form.assignedUserIds.length === 0 && form.assignedDepartmentIds.length === 0) nextErrors.assignments = "Select at least one user, department, or All Staff.";
    setValidationErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    const sharedPayload = {
      category: form.category,
      categoryOther: form.category === "Other" ? form.categoryOther.trim() : null,
      description: form.description.trim() || null,
      dueDate: form.dueDate || null,
      requiresSignature: form.requiresSignature,
      status: form.status,
      sensitive: form.sensitive,
      allowDownload: form.allowDownload,
      userIds: form.allStaff ? [] : form.assignedUserIds,
      departmentIds: form.allStaff ? [] : form.assignedDepartmentIds,
      allStaff: form.allStaff
    };

    try {
      setError("");
      if (editingDocument) {
        const selectedFile = selectedFiles[0] || null;
        await updateHrDocument(Number(editingDocument.id), {
          ...sharedPayload,
          fileName: selectedFile?.name || editingDocument.file_name,
          fileData: selectedFile ? await readFileAsDataUrl(selectedFile) : null
        });
      } else {
        for (const file of selectedFiles) {
          await createHrDocument({
            ...sharedPayload,
            fileName: file.name,
            fileData: await readFileAsDataUrl(file)
          });
        }
      }
      resetUploadModal();
      await load();
    } catch (submitError) {
      setError(getApiErrorMessage(submitError));
    }
  }

  async function archiveSelectedDocument(document: DocumentViewerRecord) {
    try {
      setError("");
      await archiveHrDocument(Number(document.id));
      await load();
    } catch (archiveError) {
      setError(getApiErrorMessage(archiveError));
    }
  }

  async function deleteSelectedDocument(document: DocumentViewerRecord) {
    const confirmed = window.confirm("Are you sure you want to delete this document?");
    if (!confirmed) return;

    try {
      setError("");
      await deleteHrDocument(Number(document.id));
      await load();
    } catch (deleteError) {
      setError(getApiErrorMessage(deleteError));
    }
  }

  return (
    <div className="legacy-portal">
      {error ? <div className="hr-card" style={{ marginBottom: 20, color: "#b91c1c", borderColor: "#fecaca", background: "#fff1f2" }}>{error}</div> : null}

      <div className="legacy-header">
        <div>
          <h1 className="legacy-header__title">Documents</h1>
          <p className="legacy-header__subtitle">Track active document assignments, signatures, and due dates through a registry-first workflow.</p>
          <div className="legacy-role"><Shield className="h-4 w-4" />HR Role: {formatHrRoleLabel(hrRole)}</div>
        </div>
        {canManage ? <button type="button" className="legacy-primary-btn" onClick={() => setShowUploadModal(true)}><Upload className="h-4 w-4" />Upload Document</button> : null}
      </div>

      <section className="legacy-stats-grid">
        {[
          { label: "Active Documents", value: activeDocuments.length, icon: FolderUp, color: "blue" },
          { label: "Needs Signature", value: activeDocumentsRequiringSignature.length, icon: FileSignature, color: "amber" },
          { label: "Assigned Users", value: activeDocuments.reduce((count, document) => count + getEffectiveAssignedUserIds(document).length, 0), icon: Users, color: "green" }
        ].map((stat) => (
          <div key={stat.label} className={`legacy-stat-card ${stat.color}`}>
            <div className="legacy-stat-icon"><stat.icon className="h-5 w-5" /></div>
            <div><p className="legacy-stat-value">{stat.value}</p><p className="legacy-stat-title">{stat.label}</p></div>
          </div>
        ))}
      </section>

      <section className="legacy-toolbar">
        <div className="legacy-toolbar__row">
          <div className="legacy-search"><Search className="h-4 w-4" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search documents..." /></div>
        </div>
      </section>

      <div className="legacy-panel">
        <div className="legacy-panel-header"><div><h2>Document Registry</h2><p>Managers can review non-sensitive team documents. Sensitive documents remain visible but private.</p></div></div>
        <div className="legacy-panel-body">
          {filteredDocuments.length ? (
            <table className="legacy-table">
              <thead>
                <tr>
                  <th>File Name</th>
                  <th>Category</th>
                  <th>Assigned To</th>
                  <th>Due Date</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredDocuments.map((document) => {
                  const canOpen = canOpenDocument(document, viewer);
                  const status = getDocumentStatus(document);
                  return (
                    <tr
                      key={String(document.id)}
                      className={!canOpen ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
                      onClick={() => {
                        if (!canOpen) return;
                        console.log("Navigating to document page:", document.id);
                        router.push(`/documents/${document.id}`);
                      }}
                    >
                      <td>
                        <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                          <span>{document.file_name}</span>
                          {document.sensitive ? <span title="Private document"><Lock className="h-4 w-4 text-slate-500" /></span> : null}
                        </div>
                        <div className="text-xs text-slate-500">{document.description || "No description"}</div>
                      </td>
                      <td>{categoryLabel(document)}</td>
                      <td>{assignmentSummary(document)}</td>
                      <td>{formatDate(document.due_date)}</td>
                      <td><span className={getStatusBadgeClass(status)}>{status === "pending" ? "Pending" : status === "signed" ? "Signed" : "Archived"}</span></td>
                      <td>
                        <div className="flex items-center gap-2">
                          {document.allow_download ? <button type="button" className="legacy-icon-btn" title="Download" onClick={(event) => { event.stopPropagation(); window.open(getHrDocumentDownloadUrl(Number(document.id)), "_blank", "noopener,noreferrer"); }}><Download className="h-4 w-4" /></button> : null}
                          {viewer?.role === "ADMIN" ? <button type="button" className="legacy-icon-btn" title="Edit" onClick={(event) => { event.stopPropagation(); startEditDocument(document); }}><Pencil className="h-4 w-4" /></button> : null}
                          {viewer?.role === "ADMIN" && status === "signed" ? <button type="button" className="legacy-icon-btn" title="Archive" onClick={(event) => { event.stopPropagation(); void archiveSelectedDocument(document); }}><FolderUp className="h-4 w-4" /></button> : null}
                          {viewer?.role === "ADMIN" ? <button type="button" className="legacy-icon-btn" title="Delete" onClick={(event) => { event.stopPropagation(); void deleteSelectedDocument(document); }}><Trash2 className="h-4 w-4" /></button> : null}
                          {!document.allow_download && viewer?.role !== "ADMIN" ? <span className="text-slate-400">-</span> : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : <div className="legacy-empty">No documents are visible in the current view.</div>}
        </div>
      </div>

      {showUploadModal ? (
        <div className="legacy-modal-overlay">
          <div className="legacy-modal legacy-modal--wide">
            <div className="legacy-modal-header"><h2>{editingDocument ? "Edit Document" : "Upload Document"}</h2><button type="button" className="legacy-icon-btn" onClick={resetUploadModal}><X className="h-4 w-4" /></button></div>
            <div className="legacy-modal-body">
              <div className="legacy-form-grid">
                <div className="legacy-form-group legacy-form-group--full">
                  <label>File Upload</label>
                  <input ref={fileInputRef} type="file" hidden multiple={!editingDocument} onChange={(event) => handleFileChange(event.target.files)} />
                  <button type="button" className="legacy-dropzone" onClick={() => fileInputRef.current?.click()}>
                    <Upload className="h-5 w-5" />
                    <span>{selectedFiles.length ? (selectedFiles.length === 1 ? selectedFiles[0].name : `${selectedFiles.length} files selected`) : editingDocument ? editingDocument.file_name : "Select one or more files to upload."}</span>
                  </button>
                  {validationErrors.file ? <p className="legacy-field-error">{validationErrors.file}</p> : null}
                </div>
                <div className="legacy-form-group"><label>Category</label><select value={form.category} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}>{categoryOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select></div>
                {form.category === "Other" ? <div className="legacy-form-group"><label>Specify Other</label><input value={form.categoryOther} onChange={(event) => setForm((current) => ({ ...current, categoryOther: event.target.value }))} />{validationErrors.categoryOther ? <p className="legacy-field-error">{validationErrors.categoryOther}</p> : null}</div> : null}
                <div className="legacy-form-group"><label>Due Date</label><input type="date" value={form.dueDate} onChange={(event) => setForm((current) => ({ ...current, dueDate: event.target.value }))} /></div>
                <div className="legacy-form-group legacy-form-group--full"><label>Description</label><textarea value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} /></div>
                <div className="legacy-form-group legacy-form-group--full">
                  <div className="legacy-form-section">
                    <div className="legacy-form-section__header"><h3>Assignment</h3><p>Choose who should receive this document.</p></div>
                    <div className="legacy-form-section__body">
                      {checkboxRow("All Staff", form.allStaff, (checked) => setForm((current) => ({ ...current, allStaff: checked, assignedUserIds: checked ? [] : current.assignedUserIds, assignedDepartmentIds: checked ? [] : current.assignedDepartmentIds })))}
                      <div className="legacy-picker-row"><div><label className="legacy-picker-label">Users</label><div className="legacy-chip-list legacy-chip-list--compact">{selectedUsers.length ? selectedUsers.map((candidate) => <span key={candidate.id} className="legacy-selection-tag">{candidate.name || candidate.email}<button type="button" onClick={() => setForm((current) => ({ ...current, assignedUserIds: current.assignedUserIds.filter((value) => value !== candidate.id) }))} disabled={form.allStaff}><X className="h-3 w-3" /></button></span>) : <span className="legacy-selection-empty">No users selected.</span>}</div></div><button type="button" className="legacy-secondary-btn" onClick={openUserPicker} disabled={form.allStaff}><Plus className="h-4 w-4" />Add Users</button></div>
                      <div className="legacy-picker-row"><div><label className="legacy-picker-label">Departments</label><div className="legacy-chip-list legacy-chip-list--compact">{selectedDepartments.length ? selectedDepartments.map((candidate) => <span key={candidate.id} className="legacy-selection-tag">{candidate.name}<button type="button" onClick={() => setForm((current) => ({ ...current, assignedDepartmentIds: current.assignedDepartmentIds.filter((value) => value !== candidate.id) }))} disabled={form.allStaff}><X className="h-3 w-3" /></button></span>) : <span className="legacy-selection-empty">No departments selected.</span>}</div></div><button type="button" className="legacy-secondary-btn" onClick={openDepartmentPicker} disabled={form.allStaff}><Plus className="h-4 w-4" />Add Departments</button></div>
                      {validationErrors.assignments ? <p className="legacy-field-error">{validationErrors.assignments}</p> : null}
                    </div>
                  </div>
                </div>
                <div className="legacy-form-group legacy-form-group--full"><div className="legacy-form-section"><div className="legacy-form-section__header"><h3>Options</h3><p>Control how this document should be handled after assignment.</p></div><div className="legacy-form-section__options">{checkboxRow("Requires Signature", form.requiresSignature, (checked) => setForm((current) => ({ ...current, requiresSignature: checked })))}{checkboxRow("Sensitive", form.sensitive, (checked) => setForm((current) => ({ ...current, sensitive: checked })))}{checkboxRow("Allow Download", form.allowDownload, (checked) => setForm((current) => ({ ...current, allowDownload: checked })))}</div></div></div>
                <div className="legacy-form-group"><label>Status</label><select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}>{statusOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select></div>
              </div>
            </div>
            <div className="legacy-modal-footer"><button type="button" className="legacy-secondary-btn" onClick={resetUploadModal}>Cancel</button><button type="button" className="legacy-primary-btn" onClick={() => void submitDocument()}><Save className="h-4 w-4" />{editingDocument ? "Update Document" : "Upload Document"}</button></div>
          </div>
        </div>
      ) : null}

      {showUserPicker ? (
        <div className="legacy-modal-overlay"><div className="legacy-modal" style={{ maxWidth: 680 }}><div className="legacy-modal-header"><h2>Add Users</h2><button type="button" className="legacy-icon-btn" onClick={() => setShowUserPicker(false)}><X className="h-4 w-4" /></button></div><div className="legacy-modal-body"><div className="legacy-search" style={{ marginBottom: 16 }}><Search className="h-4 w-4" /><input value={userSearch} onChange={(event) => setUserSearch(event.target.value)} placeholder="Search users..." /></div><div className="legacy-chip-list legacy-chip-list--compact" style={{ marginBottom: 16 }}>{draftUserIds.length ? draftUserIds.map((userId) => { const candidate = users.find((option) => option.id === userId); if (!candidate) return null; return <span key={userId} className="legacy-selection-tag">{candidate.name || candidate.email}<button type="button" onClick={() => setDraftUserIds((current) => current.filter((value) => value !== userId))}><X className="h-3 w-3" /></button></span>; }) : <span className="legacy-selection-empty">No users selected yet.</span>}</div><div className="legacy-picker-list">{filteredUserOptions.map((candidate) => { const selected = draftUserIds.includes(candidate.id); return <button key={candidate.id} type="button" className={`legacy-picker-item ${selected ? "is-active" : ""}`} onClick={() => setDraftUserIds((current) => selected ? current.filter((value) => value !== candidate.id) : [...current, candidate.id])}><div><strong>{candidate.name || candidate.email}</strong><div>{candidate.email}</div></div><span>{selected ? "Selected" : "Add"}</span></button>; })}</div></div><div className="legacy-modal-footer"><button type="button" className="legacy-secondary-btn" onClick={() => setShowUserPicker(false)}>Cancel</button><button type="button" className="legacy-primary-btn" onClick={() => { setForm((current) => ({ ...current, assignedUserIds: draftUserIds })); setShowUserPicker(false); }}>Save Users</button></div></div></div>
      ) : null}

      {showDepartmentPicker ? (
        <div className="legacy-modal-overlay"><div className="legacy-modal" style={{ maxWidth: 680 }}><div className="legacy-modal-header"><h2>Add Departments</h2><button type="button" className="legacy-icon-btn" onClick={() => setShowDepartmentPicker(false)}><X className="h-4 w-4" /></button></div><div className="legacy-modal-body"><div className="legacy-search" style={{ marginBottom: 16 }}><Search className="h-4 w-4" /><input value={departmentSearch} onChange={(event) => setDepartmentSearch(event.target.value)} placeholder="Search departments..." /></div><div className="legacy-chip-list legacy-chip-list--compact" style={{ marginBottom: 16 }}>{draftDepartmentIds.length ? draftDepartmentIds.map((departmentId) => { const candidate = departments.find((option) => option.id === departmentId); if (!candidate) return null; return <span key={departmentId} className="legacy-selection-tag">{candidate.name}<button type="button" onClick={() => setDraftDepartmentIds((current) => current.filter((value) => value !== departmentId))}><X className="h-3 w-3" /></button></span>; }) : <span className="legacy-selection-empty">No departments selected yet.</span>}</div><div className="legacy-picker-list">{filteredDepartmentOptions.map((candidate) => { const selected = draftDepartmentIds.includes(candidate.id); return <button key={candidate.id} type="button" className={`legacy-picker-item ${selected ? "is-active" : ""}`} onClick={() => setDraftDepartmentIds((current) => selected ? current.filter((value) => value !== candidate.id) : [...current, candidate.id])}><div><strong>{candidate.name}</strong><div>{candidate.address || "No address"}</div></div><span>{selected ? "Selected" : "Add"}</span></button>; })}</div></div><div className="legacy-modal-footer"><button type="button" className="legacy-secondary-btn" onClick={() => setShowDepartmentPicker(false)}>Cancel</button><button type="button" className="legacy-primary-btn" onClick={() => { setForm((current) => ({ ...current, assignedDepartmentIds: draftDepartmentIds })); setShowDepartmentPicker(false); }}>Save Departments</button></div></div></div>
      ) : null}
    </div>
  );
}





