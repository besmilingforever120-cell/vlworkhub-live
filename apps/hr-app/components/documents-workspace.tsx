"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FileSignature, FolderUp, PenSquare, Save, Search, Shield, Upload, Users, X } from "lucide-react";
import type { SessionUser } from "@vlworkhub/types";
import {
  createResource,
  getApiErrorMessage,
  getCurrentUser,
  getResource,
  getSharedUsers,
  type HrRecord,
  type HrUser
} from "../lib/hr-client";
import { HrPortalHeader } from "./hr-portal-header";
import { formatDate, isHrManager, splitAssignees } from "../lib/workflow-utils";

type DetailTab = "metadata" | "signatures";

type DocumentForm = {
  title: string;
  category: string;
  owner_name: string;
  storage_path: string;
  due_date: string;
  requires_signature: string;
  status: string;
  file_name: string;
  mime_type: string;
  file_size: string;
  description: string;
  department: string;
};

type ValidationState = Partial<Record<keyof DocumentForm | "upload_file", string>>;

const detailStorageKey = "vlworkhub.hr.documents.detail-tab";

function emptyDocumentForm(): DocumentForm {
  return {
    title: "",
    category: "Policy",
    owner_name: "",
    storage_path: "",
    due_date: "",
    requires_signature: "Yes",
    status: "Pending Signature",
    file_name: "",
    mime_type: "",
    file_size: "",
    description: "",
    department: "HR"
  };
}

function validateDocumentForm(form: DocumentForm, uploadFile: File | null): ValidationState {
  const next: ValidationState = {};
  if (!uploadFile) next.upload_file = "Select a file to upload.";
  if (!form.title.trim()) next.title = "Document title is required.";
  if (!form.category.trim()) next.category = "Category is required.";
  return next;
}

export function DocumentsWorkspace() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [users, setUsers] = useState<HrUser[]>([]);
  const [documents, setDocuments] = useState<HrRecord[]>([]);
  const [signatures, setSignatures] = useState<HrRecord[]>([]);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showRegisterForm, setShowRegisterForm] = useState(false);
  const [detailTab, setDetailTab] = useState<DetailTab>("metadata");
  const [documentForm, setDocumentForm] = useState<DocumentForm>(emptyDocumentForm());
  const [signatureNote, setSignatureNote] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [validationErrors, setValidationErrors] = useState<ValidationState>({});
  const [error, setError] = useState("");

  async function load() {
    try {
      setError("");
      const [session, platformUsers, documentData, signatureData] = await Promise.all([
        getCurrentUser(),
        getSharedUsers(),
        getResource("documents"),
        getResource("document_signatures")
      ]);
      setUser(session);
      setUsers(platformUsers);
      setDocuments(documentData);
      setSignatures(signatureData);
      setSelectedId((current) => current ?? Number(documentData[0]?.id ?? null));
    } catch (loadError) {
      setError(getApiErrorMessage(loadError));
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    const saved = window.sessionStorage.getItem(detailStorageKey) as DetailTab | null;
    if (saved === "metadata" || saved === "signatures") setDetailTab(saved);
  }, []);

  useEffect(() => {
    window.sessionStorage.setItem(detailStorageKey, detailTab);
  }, [detailTab]);

  const canManage = isHrManager(user);

  const filteredDocuments = useMemo(() => {
    return documents.filter((document) =>
      [document.title, document.category, document.owner_name, document.storage_path, document.department, document.description]
        .map((value) => String(value ?? "").toLowerCase())
        .some((value) => value.includes(query.toLowerCase()))
    );
  }, [documents, query]);

  const signatureMap = useMemo(() => {
    return signatures.reduce<Record<string, HrRecord[]>>((acc, item) => {
      const key = String(item.document_id ?? "");
      acc[key] = [...(acc[key] || []), item];
      return acc;
    }, {});
  }, [signatures]);

  const selectedDocument = useMemo(
    () => filteredDocuments.find((document) => Number(document.id) === selectedId) || filteredDocuments[0] || null,
    [filteredDocuments, selectedId]
  );

  const stats = {
    documents: documents.length,
    signatures: signatures.length,
    pending: signatures.filter((item) => String(item.status ?? "") !== "Signed").length
  };

  function resetUploadState() {
    setDocumentForm(emptyDocumentForm());
    setUploadFile(null);
    setValidationErrors({});
  }

  function handleFileSelect(file: File | null) {
    setUploadFile(file);
    if (!file) return;
    setValidationErrors((current) => ({ ...current, upload_file: undefined }));
    setDocumentForm((current) => ({
      ...current,
      title: current.title || file.name.replace(/\.[^.]+$/, ""),
      file_name: file.name,
      mime_type: file.type || "application/octet-stream",
      file_size: String(file.size),
      storage_path: current.storage_path || `/hr-documents/${file.name}`
    }));
  }

  async function registerDocument() {
    const nextErrors = validateDocumentForm(documentForm, uploadFile);
    setValidationErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    try {
      const created = await createResource("documents", documentForm);
      const signers = documentForm.owner_name ? splitAssignees(documentForm.owner_name) : [user?.fullName || ""];
      if (documentForm.requires_signature === "Yes") {
        for (const signer of signers) {
          await createResource("document_signatures", {
            document_id: String(created.id),
            signer_name: signer,
            status: "Pending",
            signed_at: "",
            note: "Awaiting acknowledgement"
          });
        }
      }
      resetUploadState();
      setShowRegisterForm(false);
      await load();
    } catch (submitError) {
      setError(getApiErrorMessage(submitError));
    }
  }

  async function signSelectedDocument() {
    if (!selectedDocument) return;
    try {
      await createResource("document_signatures", {
        document_id: String(selectedDocument.id),
        signer_name: user?.fullName || "",
        status: "Signed",
        signed_at: new Date().toISOString(),
        note: signatureNote || "Signed in VLWorkHub"
      });
      setSignatureNote("");
      await load();
    } catch (signError) {
      setError(getApiErrorMessage(signError));
    }
  }

  return (
    <div className="legacy-portal">
      <HrPortalHeader
        title="Documents"
        description="The document center now mirrors the SharePoint portal layout with upload authoring, registry browsing, metadata review, and signature tracking in the side pane."
        breadcrumb="Documents"
      />
      {error ? <div className="hr-card" style={{ marginBottom: 20, color: "#b91c1c", borderColor: "#fecaca", background: "#fff1f2" }}>{error}</div> : null}

      <div className="legacy-header">
        <div>
          <h1 className="legacy-header__title">Documents</h1>
          <p className="legacy-header__subtitle">Publish operational documents, request acknowledgement, and track signature completion.</p>
          <div className="legacy-role"><Shield className="h-4 w-4" />Role: {user?.roles?.join(", ") || user?.role || "Employee"}</div>
        </div>
        {canManage ? <button type="button" className="legacy-primary-btn" onClick={() => setShowRegisterForm(true)}><Upload className="h-4 w-4" />Upload Document</button> : null}
      </div>

      <section className="legacy-stats-grid">
        {[{ label: "Documents", value: stats.documents, icon: FolderUp, color: "blue" }, { label: "Signature Records", value: stats.signatures, icon: FileSignature, color: "amber" }, { label: "Pending", value: stats.pending, icon: PenSquare, color: "red" }].map((stat) => (
          <div key={stat.label} className={`legacy-stat-card ${stat.color}`}>
            <div className="legacy-stat-icon"><stat.icon className="h-5 w-5" /></div>
            <div><p className="legacy-stat-value">{stat.value}</p><p className="legacy-stat-title">{stat.label}</p></div>
          </div>
        ))}
      </section>

      <section className="legacy-toolbar">
        <div className="legacy-toolbar__row">
          <div className="legacy-search"><Search className="h-4 w-4" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title, category, owner, or storage path..." /></div>
        </div>
      </section>

      <div className="legacy-doc-layout">
        <div className="legacy-panel">
          <div className="legacy-panel-header"><div><h2>Document Registry</h2><p>Published items remain visible in the same registry-first layout as the SPFx portal.</p></div></div>
          <div className="legacy-panel-body">
            <div className="legacy-doc-grid">
              {filteredDocuments.length ? filteredDocuments.map((document) => {
                const queue = signatureMap[String(document.id)] || [];
                const isSelected = Number(document.id) === Number(selectedDocument?.id);
                return (
                  <article key={String(document.id)} className={`legacy-doc-card ${isSelected ? "is-selected" : ""}`} onClick={() => setSelectedId(Number(document.id))}>
                    <div className="legacy-card-header">
                      <div>
                        <h3 className="legacy-card-title">{String(document.title ?? "Document")}</h3>
                        <p className="legacy-card-muted">{String(document.category ?? "Category")} · {String(document.file_name ?? document.storage_path ?? "No path")}</p>
                      </div>
                      <span className={`legacy-status ${String(document.status ?? "") === "Signed" ? "completed" : "progress"}`}>{String(document.status ?? "Pending")}</span>
                    </div>
                    <div className="legacy-meta-list">
                      <div className="legacy-meta-item"><Users className="h-4 w-4" />{String(document.owner_name ?? "No owner")}</div>
                      <div className="legacy-meta-item"><FileSignature className="h-4 w-4" />Queue: {queue.length}</div>
                      <div className="legacy-meta-item">Due: {formatDate(document.due_date)}</div>
                    </div>
                  </article>
                );
              }) : <div className="legacy-empty">No documents match the current search.</div>}
            </div>
          </div>
        </div>

        <aside className="legacy-panel">
          <div className="legacy-panel-header"><div><h2>Document Detail</h2><p>Use the right-side pane to review metadata and signature state for the selected document.</p></div></div>
          <div className="legacy-panel-body">
            {selectedDocument ? (
              <>
                <div className="legacy-tabs legacy-tabs--compact">
                  <button type="button" className={`legacy-tab-btn ${detailTab === "metadata" ? "is-active" : ""}`} onClick={() => setDetailTab("metadata")}>Metadata</button>
                  <button type="button" className={`legacy-tab-btn ${detailTab === "signatures" ? "is-active" : ""}`} onClick={() => setDetailTab("signatures")}>Signatures</button>
                </div>

                {detailTab === "metadata" ? (
                  <div className="legacy-detail-stack">
                    <div className="legacy-detail-card">
                      <h3>{String(selectedDocument.title ?? "Document")}</h3>
                      <p>{String(selectedDocument.file_name ?? selectedDocument.storage_path ?? "No storage path")}</p>
                      <p>Category: {String(selectedDocument.category ?? "-")}</p>
                      <p>Department: {String(selectedDocument.department ?? "-")}</p>
                      <p>Due: {formatDate(selectedDocument.due_date)}</p>
                    </div>
                    <div className="legacy-detail-card">
                      <h4>Description</h4>
                      <p>{String(selectedDocument.description ?? "No description provided.")}</p>
                    </div>
                    <div className="legacy-detail-card"><div className="legacy-role"><Shield className="h-4 w-4" />Role: {user?.roles?.join(", ") || user?.role || "Employee"}</div></div>
                  </div>
                ) : (
                  <div className="legacy-detail-stack">
                    <div className="legacy-detail-card">
                      <h4>Signature Queue</h4>
                      <div className="legacy-chip-list">
                        {(signatureMap[String(selectedDocument.id)] || []).map((signature) => (
                          <span key={String(signature.id)} className={`legacy-chip ${String(signature.status ?? "") === "Signed" ? "complete" : "pending"}`}>{String(signature.signer_name ?? "Signer")}</span>
                        ))}
                        {!(signatureMap[String(selectedDocument.id)] || []).length ? <div className="legacy-card-muted">No signature rows have been created yet.</div> : null}
                      </div>
                    </div>
                    <div className="legacy-detail-card">
                      <h4>Acknowledge / Sign</h4>
                      <input value={signatureNote} onChange={(event) => setSignatureNote(event.target.value)} placeholder="Optional signature note" />
                      <div className="legacy-actions-row" style={{ marginTop: 16 }}>
                        <button type="button" className="legacy-primary-btn" onClick={() => void signSelectedDocument()}><PenSquare className="h-4 w-4" />Sign Document</button>
                      </div>
                    </div>
                  </div>
                )}
              </>
            ) : <div className="legacy-empty">Select a document to inspect the signature queue.</div>}
          </div>
        </aside>
      </div>

      {showRegisterForm ? (
        <div className="legacy-modal-overlay">
          <div className="legacy-modal legacy-modal--wide">
            <div className="legacy-modal-header"><h2>Upload Document</h2><button type="button" className="legacy-icon-btn" onClick={() => { setShowRegisterForm(false); resetUploadState(); }}><X className="h-4 w-4" /></button></div>
            <div className="legacy-modal-body">
              <div className="legacy-form-grid">
                <div className="legacy-form-group legacy-form-group--full">
                  <label>File Upload <span className="legacy-required">*</span></label>
                  <input ref={fileInputRef} type="file" hidden onChange={(event) => handleFileSelect(event.target.files?.[0] || null)} />
                  <button type="button" className={`legacy-dropzone ${dragActive ? "is-active" : ""}`} onClick={() => fileInputRef.current?.click()} onDragOver={(event) => { event.preventDefault(); setDragActive(true); }} onDragLeave={() => setDragActive(false)} onDrop={(event) => { event.preventDefault(); setDragActive(false); handleFileSelect(event.dataTransfer.files?.[0] || null); }}>
                    <Upload className="h-5 w-5" />
                    <span>{uploadFile ? uploadFile.name : "Drag and drop a document here, or click to browse."}</span>
                    <small>{uploadFile ? `${uploadFile.type || "Unknown type"} · ${uploadFile.size.toLocaleString()} bytes` : "PDF, DOCX, and image files are supported in this workflow metadata layer."}</small>
                  </button>
                  {validationErrors.upload_file ? <p className="legacy-field-error">{validationErrors.upload_file}</p> : null}
                </div>
                <div className="legacy-form-group"><label>Title <span className="legacy-required">*</span></label><input value={documentForm.title} onChange={(event) => { setDocumentForm((current) => ({ ...current, title: event.target.value })); setValidationErrors((current) => ({ ...current, title: undefined })); }} />{validationErrors.title ? <p className="legacy-field-error">{validationErrors.title}</p> : null}</div>
                <div className="legacy-form-group"><label>Category <span className="legacy-required">*</span></label><input value={documentForm.category} onChange={(event) => { setDocumentForm((current) => ({ ...current, category: event.target.value })); setValidationErrors((current) => ({ ...current, category: undefined })); }} />{validationErrors.category ? <p className="legacy-field-error">{validationErrors.category}</p> : null}</div>
                <div className="legacy-form-group"><label>Department</label><input value={documentForm.department} onChange={(event) => setDocumentForm((current) => ({ ...current, department: event.target.value }))} /></div>
                <div className="legacy-form-group"><label>Due Date</label><input type="date" value={documentForm.due_date} onChange={(event) => setDocumentForm((current) => ({ ...current, due_date: event.target.value }))} /></div>
                <div className="legacy-form-group legacy-form-group--full"><label>Description</label><textarea value={documentForm.description} onChange={(event) => setDocumentForm((current) => ({ ...current, description: event.target.value }))} /></div>
                <div className="legacy-form-group legacy-form-group--full"><label>Owner / Required Signers</label><input value={documentForm.owner_name} onChange={(event) => setDocumentForm((current) => ({ ...current, owner_name: event.target.value }))} placeholder="Comma-separated names" /></div>
                <div className="legacy-form-group legacy-form-group--full"><label>Storage Path</label><input value={documentForm.storage_path} onChange={(event) => setDocumentForm((current) => ({ ...current, storage_path: event.target.value }))} /></div>
                <div className="legacy-form-group"><label>Requires Signature</label><select value={documentForm.requires_signature} onChange={(event) => setDocumentForm((current) => ({ ...current, requires_signature: event.target.value }))}>{["Yes", "No"].map((value) => <option key={value} value={value}>{value}</option>)}</select></div>
                <div className="legacy-form-group"><label>Status</label><select value={documentForm.status} onChange={(event) => setDocumentForm((current) => ({ ...current, status: event.target.value }))}>{["Pending Signature", "Published", "Signed"].map((value) => <option key={value} value={value}>{value}</option>)}</select></div>
              </div>
            </div>
            <div className="legacy-modal-footer"><button type="button" className="legacy-secondary-btn" onClick={() => { setShowRegisterForm(false); resetUploadState(); }}>Cancel</button><button type="button" className="legacy-primary-btn" onClick={() => void registerDocument()}><Save className="h-4 w-4" />Upload Document</button></div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
