"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FileSignature, FolderUp, PenSquare, Plus, Save, Search, Shield, Upload, Users, X } from "lucide-react";
import type { SessionUser } from "@vlworkhub/types";
import {
  completeHrDocument,
  createHrDocument,
  getApiErrorMessage,
  getCurrentUser,
  getDepartments,
  getHrDocuments,
  getPlatformUsers,
  signHrDocument,
  type DepartmentRecord,
  type HrDocumentRecord,
  type PlatformUserRecord
} from "../lib/hr-client";
import { useHrRole } from "../lib/use-hr-role";
import { canCreateForHrRole, formatDate, formatHrRoleLabel } from "../lib/workflow-utils";

type DocumentForm = {
  category: string;
  categoryOther: string;  dueDate: string;
  description: string;
  assignedUserIds: string[];
  assignedDepartmentIds: string[];
  allStaff: boolean;
  requiresSignature: boolean;
  status: string;
  sensitive: boolean;
};

type ValidationState = Partial<Record<"file" | "assignments" | "categoryOther", string>>;

type DocumentViewerRecord = HrDocumentRecord;

const categoryOptions = ["Policy", "Form", "Contract", "Information", "Training", "Other"] as const;
const statusOptions = ["Pending Signature", "In Progress", "Signed"] as const;

function emptyForm(): DocumentForm {
  return {
    category: "Policy",
    categoryOther: "",    dueDate: "",
    description: "",
    assignedUserIds: [],
    assignedDepartmentIds: [],
    allStaff: false,
    requiresSignature: true,
    status: "Pending Signature",
    sensitive: false
  };
}

function categoryLabel(document: DocumentViewerRecord) {
  if (document.category === "Other" && document.category_other) {
    return `Other: ${document.category_other}`;
  }
  return document.category;
}

function statusLabel(document: DocumentViewerRecord) {
  if (document.is_completed) {
    return "Signed";
  }
  return document.status || "Pending Signature";
}

function assignmentSummary(document: DocumentViewerRecord) {
  const tokens = [
    ...(document.direct_user_names || []),
    ...(document.assigned_department_names || []).map((name) => `Department: ${name}`),
    ...(document.all_staff ? ["All Staff"] : [])
  ].filter(Boolean);

  return tokens.length ? tokens.join(", ") : "-";
}

function checkboxRow(label: string, checked: boolean, onChange: (checked: boolean) => void, disabled = false) {
  return (
    <label className={`legacy-checkbox-row ${disabled ? "is-disabled" : ""}`}>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} disabled={disabled} />
      <span>{label}</span>
    </label>
  );
}

export function DocumentsWorkspace() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { role: hrRole } = useHrRole();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [users, setUsers] = useState<PlatformUserRecord[]>([]);
  const [departments, setDepartments] = useState<DepartmentRecord[]>([]);
  const [documents, setDocuments] = useState<DocumentViewerRecord[]>([]);
  const [query, setQuery] = useState("");
  const [selectedDocument, setSelectedDocument] = useState<DocumentViewerRecord | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showUserPicker, setShowUserPicker] = useState(false);
  const [showDepartmentPicker, setShowDepartmentPicker] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [departmentSearch, setDepartmentSearch] = useState("");
  const [draftUserIds, setDraftUserIds] = useState<string[]>([]);
  const [draftDepartmentIds, setDraftDepartmentIds] = useState<string[]>([]);
  const [form, setForm] = useState<DocumentForm>(emptyForm());
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<ValidationState>({});
  const [error, setError] = useState("");

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  async function load() {
    setError("");
    const [sessionResult, usersResult, departmentsResult, documentsResult] = await Promise.allSettled([
      getCurrentUser(),
      getPlatformUsers(),
      getDepartments(),
      getHrDocuments()
    ]);

    if (sessionResult.status === "fulfilled") {
      setUser(sessionResult.value);
    } else {
      console.error("[Documents] GET /auth/me failed", sessionResult.reason);
    }

    if (usersResult.status === "fulfilled") {
      setUsers(usersResult.value.items || []);
    } else {
      console.error("[Documents] GET /api/users failed", usersResult.reason);
      setUsers([]);
    }

    if (departmentsResult.status === "fulfilled") {
      setDepartments(departmentsResult.value.items || []);
    } else {
      console.error("[Documents] GET /api/departments failed", departmentsResult.reason);
      setDepartments([]);
    }

    if (documentsResult.status === "fulfilled") {
      const items = (documentsResult.value.items || []) as DocumentViewerRecord[];
      setDocuments(items);
      setSelectedDocument((current) => current ? items.find((item) => Number(item.id) === Number(current.id)) || null : null);
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
  const activeDocuments = useMemo(() => documents.filter((document) => !document.is_completed), [documents]);
  const filteredDocuments = useMemo(() => {
    const normalizedQuery = query.toLowerCase();
    return activeDocuments.filter((document) => {
      const haystack = [
        document.file_name,
        categoryLabel(document),
        document.department_name || "",
        assignmentSummary(document),
        document.description || ""
      ].join(" ").toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [activeDocuments, query]);

  const activeDocumentsRequiringSignature = useMemo(
    () => activeDocuments.filter((document) => document.requires_signature),
    [activeDocuments]
  );

  const canSignSelected = Boolean(selectedDocument?.can_sign);
  const canCompleteSelected = Boolean(selectedDocument?.can_complete);
  const showSignaturePanel = Boolean(selectedDocument?.can_view_actions);

  const selectedUsers = useMemo(
    () => users.filter((candidate) => form.assignedUserIds.includes(candidate.id)),
    [form.assignedUserIds, users]
  );

  const selectedDepartments = useMemo(
    () => departments.filter((candidate) => form.assignedDepartmentIds.includes(candidate.id)),
    [departments, form.assignedDepartmentIds]
  );

  const filteredUserOptions = useMemo(() => {
    const normalized = userSearch.toLowerCase();
    return users.filter((candidate) => {
      const haystack = `${candidate.name || ""} ${candidate.email || ""}`.toLowerCase();
      return haystack.includes(normalized);
    });
  }, [userSearch, users]);

  const filteredDepartmentOptions = useMemo(() => {
    const normalized = departmentSearch.toLowerCase();
    return departments.filter((candidate) => {
      const haystack = `${candidate.name || ""} ${candidate.address || ""}`.toLowerCase();
      return haystack.includes(normalized);
    });
  }, [departmentSearch, departments]);

  function resetUploadModal() {
    setShowUploadModal(false);
    setShowUserPicker(false);
    setShowDepartmentPicker(false);
    setUserSearch("");
    setDepartmentSearch("");
    setDraftUserIds([]);
    setDraftDepartmentIds([]);
    setForm(emptyForm());
    setSelectedFile(null);
    setValidationErrors({});
  }

  function handleFileChange(file: File | null) {
    setSelectedFile(file);
    setValidationErrors((current) => ({ ...current, file: undefined }));
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    if (file && file.type.includes("pdf")) {
      setPreviewUrl(URL.createObjectURL(file));
    }
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

  async function submitDocument() {
    const nextErrors: ValidationState = {};
    if (!selectedFile) nextErrors.file = "Select a file to upload.";
    if (form.category === "Other" && !form.categoryOther.trim()) nextErrors.categoryOther = "Specify the document category.";
    if (!form.allStaff && form.assignedUserIds.length === 0 && form.assignedDepartmentIds.length === 0) nextErrors.assignments = "Select at least one user, department, or All Staff.";
    setValidationErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0 || !selectedFile) {
      return;
    }

    try {
      setError("");
      await createHrDocument({
        title: selectedFile.name,
        fileName: selectedFile.name,
        category: form.category,
        categoryOther: form.category === "Other" ? form.categoryOther.trim() : null,        description: form.description.trim() || null,
        dueDate: form.dueDate || null,
        requiresSignature: form.requiresSignature,
        status: form.status,
        sensitive: form.sensitive,
        userIds: form.allStaff ? [] : form.assignedUserIds,
        departmentIds: form.allStaff ? [] : form.assignedDepartmentIds,
        allStaff: form.allStaff
      });
      resetUploadModal();
      await load();
    } catch (submitError) {
      setError(getApiErrorMessage(submitError));
    }
  }

  async function signSelected() {
    if (!selectedDocument) return;
    try {
      setError("");
      await signHrDocument(Number(selectedDocument.id));
      await load();
    } catch (signError) {
      setError(getApiErrorMessage(signError));
    }
  }

  async function completeSelected() {
    if (!selectedDocument) return;
    try {
      setError("");
      await completeHrDocument(Number(selectedDocument.id));
      setSelectedDocument(null);
      await load();
    } catch (completeError) {
      setError(getApiErrorMessage(completeError));
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
          { label: "Assigned Users", value: activeDocuments.reduce((count, document) => count + document.assigned_user_ids.length, 0), icon: Users, color: "green" }
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
        <div className="legacy-panel-header"><div><h2>Document Registry</h2><p>Only active documents remain in the registry. Completed documents disappear automatically.</p></div></div>
        <div className="legacy-panel-body">
          {filteredDocuments.length ? (
            <table className="legacy-table">
              <thead>
                <tr>
                  <th>File Name</th>
                  <th>Category</th>
                  <th>Department</th>
                  <th>Assigned To</th>
                  <th>Due Date</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredDocuments.map((document) => (
                  <tr key={String(document.id)} onClick={() => setSelectedDocument(document)} style={{ cursor: "pointer" }}>
                    <td>
                      <div className="text-sm font-semibold text-slate-900">{document.file_name}</div>
                      {document.sensitive ? <div className="text-xs text-rose-600">Sensitive</div> : null}
                    </td>
                    <td>{categoryLabel(document)}</td>
                    <td>{document.department_name || "-"}</td>
                    <td>{assignmentSummary(document)}</td>
                    <td>{formatDate(document.due_date)}</td>
                    <td>{statusLabel(document)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <div className="legacy-empty">No active documents match the current view.</div>}
        </div>
      </div>

      {selectedDocument ? (
        <div className="legacy-modal-overlay">
          <div className="legacy-modal legacy-modal--wide" style={{ maxWidth: 1200 }}>
            <div className="legacy-modal-header"><h2>{selectedDocument.file_name}</h2><button type="button" className="legacy-icon-btn" onClick={() => setSelectedDocument(null)}><X className="h-4 w-4" /></button></div>
            <div className="legacy-modal-body">
              <div className="legacy-doc-layout" style={{ gridTemplateColumns: showSignaturePanel ? "minmax(0, 1.6fr) minmax(320px, 0.8fr)" : "1fr" }}>
                <div className="legacy-panel">
                  <div className="legacy-panel-header"><div><h2>Preview</h2><p>{selectedDocument.file_url || "No document URL available."}</p></div></div>
                  <div className="legacy-panel-body" style={{ minHeight: 520 }}>
                    {selectedDocument.file_url ? (
                      <iframe title={selectedDocument.file_name} src={selectedDocument.file_url} style={{ width: "100%", minHeight: 480, border: "1px solid #e2e8f0", borderRadius: 16 }} />
                    ) : (
                      <div className="legacy-empty">Preview unavailable for this document.</div>
                    )}
                  </div>
                </div>
                {showSignaturePanel ? (
                  <aside className="legacy-panel">
                    <div className="legacy-panel-header"><div><h2>Signature Panel</h2><p>Only users assigned through direct, department, or all-staff targeting can act on this document.</p></div></div>
                    <div className="legacy-panel-body">
                      <div className="legacy-detail-stack">
                        <div className="legacy-detail-card">
                          <h4>Assignment</h4>
                          <p>Department: {selectedDocument.department_name || "-"}</p>
                          <p>Assigned to: {assignmentSummary(selectedDocument)}</p>
                          <p>Signed by: {selectedDocument.signed_user_names.join(", ") || "-"}</p>
                          <p>Due: {formatDate(selectedDocument.due_date)}</p>
                        </div>
                        <div className="legacy-actions-row">
                          <button type="button" className="legacy-primary-btn" onClick={() => void signSelected()} disabled={!canSignSelected}><PenSquare className="h-4 w-4" />Sign</button>
                          <button type="button" className="legacy-secondary-btn" onClick={() => void completeSelected()} disabled={!canCompleteSelected}>Complete</button>
                        </div>
                      </div>
                    </div>
                  </aside>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {showUploadModal ? (
        <div className="legacy-modal-overlay">
          <div className="legacy-modal legacy-modal--wide">
            <div className="legacy-modal-header"><h2>Upload Document</h2><button type="button" className="legacy-icon-btn" onClick={resetUploadModal}><X className="h-4 w-4" /></button></div>
            <div className="legacy-modal-body">
              <div className="legacy-form-grid">
                <div className="legacy-form-group legacy-form-group--full">
                  <label>File Upload</label>
                  <input ref={fileInputRef} type="file" hidden onChange={(event) => handleFileChange(event.target.files?.[0] || null)} />
                  <button type="button" className="legacy-dropzone" onClick={() => fileInputRef.current?.click()}>
                    <Upload className="h-5 w-5" />
                    <span>{selectedFile ? selectedFile.name : "Select a file to upload."}</span>
                  </button>
                  {validationErrors.file ? <p className="legacy-field-error">{validationErrors.file}</p> : null}
                </div>
                <div className="legacy-form-group"><label>Category</label><select value={form.category} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}>{categoryOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select></div>
                {form.category === "Other" ? <div className="legacy-form-group"><label>Specify Other</label><input value={form.categoryOther} onChange={(event) => setForm((current) => ({ ...current, categoryOther: event.target.value }))} />{validationErrors.categoryOther ? <p className="legacy-field-error">{validationErrors.categoryOther}</p> : null}</div> : null}                <div className="legacy-form-group"><label>Due Date</label><input type="date" value={form.dueDate} onChange={(event) => setForm((current) => ({ ...current, dueDate: event.target.value }))} /></div>
                <div className="legacy-form-group legacy-form-group--full"><label>Description</label><textarea value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} /></div>

                <div className="legacy-form-group legacy-form-group--full">
                  <div className="legacy-form-section">
                    <div className="legacy-form-section__header">
                      <h3>Assignment</h3>
                      <p>Choose who should receive this document.</p>
                    </div>
                    <div className="legacy-form-section__body">
                      {checkboxRow("All Staff", form.allStaff, (checked) => setForm((current) => ({ ...current, allStaff: checked, assignedUserIds: checked ? [] : current.assignedUserIds, assignedDepartmentIds: checked ? [] : current.assignedDepartmentIds })))}
                      <div className="legacy-picker-row">
                        <div>
                          <label className="legacy-picker-label">Users</label>
                          <div className="legacy-chip-list legacy-chip-list--compact">
                            {selectedUsers.length ? selectedUsers.map((candidate) => (
                              <span key={candidate.id} className="legacy-selection-tag">
                                {candidate.name || candidate.email}
                                <button type="button" onClick={() => setForm((current) => ({ ...current, assignedUserIds: current.assignedUserIds.filter((value) => value !== candidate.id) }))} disabled={form.allStaff}><X className="h-3 w-3" /></button>
                              </span>
                            )) : <span className="legacy-selection-empty">No users selected.</span>}
                          </div>
                        </div>
                        <button type="button" className="legacy-secondary-btn" onClick={openUserPicker} disabled={form.allStaff}><Plus className="h-4 w-4" />Add Users</button>
                      </div>
                      <div className="legacy-picker-row">
                        <div>
                          <label className="legacy-picker-label">Departments</label>
                          <div className="legacy-chip-list legacy-chip-list--compact">
                            {selectedDepartments.length ? selectedDepartments.map((candidate) => (
                              <span key={candidate.id} className="legacy-selection-tag">
                                {candidate.name}
                                <button type="button" onClick={() => setForm((current) => ({ ...current, assignedDepartmentIds: current.assignedDepartmentIds.filter((value) => value !== candidate.id) }))} disabled={form.allStaff}><X className="h-3 w-3" /></button>
                              </span>
                            )) : <span className="legacy-selection-empty">No departments selected.</span>}
                          </div>
                        </div>
                        <button type="button" className="legacy-secondary-btn" onClick={openDepartmentPicker} disabled={form.allStaff}><Plus className="h-4 w-4" />Add Departments</button>
                      </div>
                      {validationErrors.assignments ? <p className="legacy-field-error">{validationErrors.assignments}</p> : null}
                    </div>
                  </div>
                </div>

                <div className="legacy-form-group legacy-form-group--full">
                  <div className="legacy-form-section">
                    <div className="legacy-form-section__header">
                      <h3>Options</h3>
                      <p>Control how this document should be handled after assignment.</p>
                    </div>
                    <div className="legacy-form-section__options">
                      {checkboxRow("Requires Signature", form.requiresSignature, (checked) => setForm((current) => ({ ...current, requiresSignature: checked })))}
                      {checkboxRow("Sensitive", form.sensitive, (checked) => setForm((current) => ({ ...current, sensitive: checked })))}
                    </div>
                  </div>
                </div>

                <div className="legacy-form-group"><label>Status</label><select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}>{statusOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select></div>
              </div>
            </div>
            <div className="legacy-modal-footer"><button type="button" className="legacy-secondary-btn" onClick={resetUploadModal}>Cancel</button><button type="button" className="legacy-primary-btn" onClick={() => void submitDocument()}><Save className="h-4 w-4" />Upload Document</button></div>
          </div>
        </div>
      ) : null}

      {showUserPicker ? (
        <div className="legacy-modal-overlay">
          <div className="legacy-modal" style={{ maxWidth: 680 }}>
            <div className="legacy-modal-header"><h2>Add Users</h2><button type="button" className="legacy-icon-btn" onClick={() => setShowUserPicker(false)}><X className="h-4 w-4" /></button></div>
            <div className="legacy-modal-body">
              <div className="legacy-search" style={{ marginBottom: 16 }}><Search className="h-4 w-4" /><input value={userSearch} onChange={(event) => setUserSearch(event.target.value)} placeholder="Search users..." /></div>
              <div className="legacy-chip-list legacy-chip-list--compact" style={{ marginBottom: 16 }}>
                {draftUserIds.length ? draftUserIds.map((userId) => {
                  const candidate = users.find((option) => option.id === userId);
                  if (!candidate) return null;
                  return (
                    <span key={userId} className="legacy-selection-tag">
                      {candidate.name || candidate.email}
                      <button type="button" onClick={() => setDraftUserIds((current) => current.filter((value) => value !== userId))}><X className="h-3 w-3" /></button>
                    </span>
                  );
                }) : <span className="legacy-selection-empty">No users selected yet.</span>}
              </div>
              <div className="legacy-picker-list">
                {filteredUserOptions.map((candidate) => {
                  const selected = draftUserIds.includes(candidate.id);
                  return (
                    <button key={candidate.id} type="button" className={`legacy-picker-item ${selected ? "is-active" : ""}`} onClick={() => setDraftUserIds((current) => selected ? current.filter((value) => value !== candidate.id) : [...current, candidate.id])}>
                      <div>
                        <strong>{candidate.name || candidate.email}</strong>
                        <div>{candidate.email}</div>
                      </div>
                      <span>{selected ? "Selected" : "Add"}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="legacy-modal-footer"><button type="button" className="legacy-secondary-btn" onClick={() => setShowUserPicker(false)}>Cancel</button><button type="button" className="legacy-primary-btn" onClick={() => { setForm((current) => ({ ...current, assignedUserIds: draftUserIds })); setShowUserPicker(false); }}>Save Users</button></div>
          </div>
        </div>
      ) : null}

      {showDepartmentPicker ? (
        <div className="legacy-modal-overlay">
          <div className="legacy-modal" style={{ maxWidth: 680 }}>
            <div className="legacy-modal-header"><h2>Add Departments</h2><button type="button" className="legacy-icon-btn" onClick={() => setShowDepartmentPicker(false)}><X className="h-4 w-4" /></button></div>
            <div className="legacy-modal-body">
              <div className="legacy-search" style={{ marginBottom: 16 }}><Search className="h-4 w-4" /><input value={departmentSearch} onChange={(event) => setDepartmentSearch(event.target.value)} placeholder="Search departments..." /></div>
              <div className="legacy-chip-list legacy-chip-list--compact" style={{ marginBottom: 16 }}>
                {draftDepartmentIds.length ? draftDepartmentIds.map((departmentId) => {
                  const candidate = departments.find((option) => option.id === departmentId);
                  if (!candidate) return null;
                  return (
                    <span key={departmentId} className="legacy-selection-tag">
                      {candidate.name}
                      <button type="button" onClick={() => setDraftDepartmentIds((current) => current.filter((value) => value !== departmentId))}><X className="h-3 w-3" /></button>
                    </span>
                  );
                }) : <span className="legacy-selection-empty">No departments selected yet.</span>}
              </div>
              <div className="legacy-picker-list">
                {filteredDepartmentOptions.map((candidate) => {
                  const selected = draftDepartmentIds.includes(candidate.id);
                  return (
                    <button key={candidate.id} type="button" className={`legacy-picker-item ${selected ? "is-active" : ""}`} onClick={() => setDraftDepartmentIds((current) => selected ? current.filter((value) => value !== candidate.id) : [...current, candidate.id])}>
                      <div>
                        <strong>{candidate.name}</strong>
                        <div>{candidate.address || "No address"}</div>
                      </div>
                      <span>{selected ? "Selected" : "Add"}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="legacy-modal-footer"><button type="button" className="legacy-secondary-btn" onClick={() => setShowDepartmentPicker(false)}>Cancel</button><button type="button" className="legacy-primary-btn" onClick={() => { setForm((current) => ({ ...current, assignedDepartmentIds: draftDepartmentIds })); setShowDepartmentPicker(false); }}>Save Departments</button></div>
          </div>
        </div>
      ) : null}
    </div>
  );
}


