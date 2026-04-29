"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  BookOpen,
  CheckCircle,
  CheckCircle2,
  Circle,
  ExternalLink,
  File,
  FileUp,
  Monitor,
  Pencil,
  PenTool,
  Play,
  Save,
  Send,
  Shield,
  Trash2,
  Upload,
  UserPlus,
  X
} from "lucide-react";
import type { SessionUser } from "@vlworkhub/types";
import {
  getApiErrorMessage,
  getFriendlyUploadValidationMessage,
  getCurrentUser,
  deleteHrOnboardingFile,
  getHrOnboardingFiles,
  updateHrOnboardingFile,
  uploadHrOnboardingFiles,
  type HrOnboardingFileRecord
} from "../lib/hr-client";
import { useHrRole } from "../lib/use-hr-role";
import { formatHrRoleLabel } from "../lib/workflow-utils";

type Section = {
  title: string;
  src: string;
  tall?: boolean;
  description?: string;
  icon?: React.ComponentType<{ className?: string }>;
  category?: string;
  external?: boolean;
};

type RequiredDocument = {
  id: string;
  label: string;
  required: boolean;
  description?: string;
  linkLabel?: string;
  linkHref?: string;
};

type SelectedUpload = {
  id: string;
  file: File;
  documentType: string;
  expiryDate: string;
};

const sections: Section[] = [
  { title: "Welcome to Venture Training", src: "https://www.canva.com/design/DAEhjxekM_c/PArzBee652TRjNIgZSlj-g/view?embed", description: "Get started with your journey at Venture. Learn about the mission, values, and what to expect in your onboarding.", icon: Play, category: "Getting Started" },
  { title: "Person-Centered Planning", src: "https://www.canva.com/design/DAEhwM89Mxw/dD9ulRTeq8oPPR7h-RU9Ag/view?embed", description: "Understand the person-centered approach and how it shapes daily support work.", icon: BookOpen, category: "Core Training" },
  { title: "Working Safely With Us", src: "https://www.canva.com/design/DAEhwiorlRY/9pR1mvdwjF83eBurAiFYDg/view?embed", description: "Review essential safety protocols and safe work practices.", icon: Shield, category: "Safety & Compliance" },
  { title: "IT Systems Tutorial", src: "https://www.canva.com/design/DAEhrbdeAzw/-ZsDeQUTcsY4vhtKJahe_w/view?embed", description: "Learn the main technology tools and systems used in the organization.", icon: Monitor, category: "Technical Training" },
  { title: "Privacy and Information Management", src: "https://www.communitylivingbc.ca/CLBC-PIM/index.html", tall: true, description: "Learn privacy, data handling, and information management expectations.", icon: FileUp, category: "Compliance", external: true },
  { title: "Membership Signing", src: "https://powerforms.docusign.net/516e5f4f-a2b5-4698-9604-a5755fd91831?env=ca&acct=31e7deb0-8039-4240-8860-f75e4a7adeaf&accountId=31e7deb0-8039-4240-8860-f75e4a7adeaf", tall: true, description: "Complete required membership documentation and digital signatures.", icon: PenTool, category: "Documentation", external: true }
];

const requiredDocuments: RequiredDocument[] = [
  { id: "Banking info", label: "Banking info", required: true, description: "Copy of banking information for direct deposit or a void cheque." },
  { id: "Certificates", label: "Certificates", required: true, description: "Upload educational certificates." },
  { id: "Food Safe", label: "Food Safe", required: true, description: "Provide a valid Food Safe certificate." },
  { id: "WHIMS", label: "WHIMS", required: true, description: "Upload your WHIMS documentation." },
  { id: "First Aid", label: "First Aid", required: true, description: "Provide your current first aid certificate." },
  { id: "Mandt Certificate", label: "Mandt Certificate", required: true, description: "Upload the Mandt/Non-Violent Crisis Intervention certificate when available." },
  { id: "Other", label: "Other", required: true, description: "Upload any other relevant onboarding documents." },
  { id: "TB Test Results", label: "TB Test Results", required: true },
  { id: "Driver's License (Front and Back)", label: "Driver's License (Front and Back)", required: true },
  { id: "Proof of Vaccinations", label: "Proof of Vaccinations", required: true, description: "If applicable, upload your COVID-19 and current season influenza vaccination records." },
  {
    id: "Driver's abstract",
    label: "Driver's abstract",
    required: true,
    description: "Obtain your personal driving record and include it with onboarding submissions.",
    linkLabel: "Open ICBC Driver Abstract portal",
    linkHref: "https://onlinebusiness.icbc.com/clio/"
  }
];

function appendParam(url: string, param: string) {
  return url.includes("?") ? `${url}&${param}` : `${url}?${param}`;
}

function getEmbedSrc(src: string) {
  if (!src.includes("canva.com")) {
    return src;
  }
  let next = src;
  if (!next.includes("embed")) {
    next = appendParam(next, "embed=1");
  }
  next = appendParam(next, "fullscreen=1");
  return next;
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

function createStorageKey(userId: string) {
  return `hr-onboarding-progress-${userId}`;
}

export function OnboardingWorkspace() {
  const { role: hrRole } = useHrRole();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [fullScreenIndex, setFullScreenIndex] = useState<number | null>(null);
  const [completedSections, setCompletedSections] = useState<Record<number, boolean>>({});
  const [onboardingCompleted, setOnboardingCompleted] = useState(false);
  const [selectedUploads, setSelectedUploads] = useState<SelectedUpload[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [uploadedFiles, setUploadedFiles] = useState<HrOnboardingFileRecord[]>([]);
  const [editingFileId, setEditingFileId] = useState<string | null>(null);
  const [editingDocumentType, setEditingDocumentType] = useState("Other");
  const [editingExpiryDate, setEditingExpiryDate] = useState("");
  const [savingFileId, setSavingFileId] = useState<string | null>(null);
  const [deletingFileId, setDeletingFileId] = useState<string | null>(null);

  async function load() {
    try {
      setLoading(true);
      setError("");
      const [session, filesResponse] = await Promise.all([getCurrentUser(), getHrOnboardingFiles()]);
      setUser(session);
      setUploadedFiles(filesResponse.items || []);

      const stored = typeof window !== "undefined" ? window.localStorage.getItem(createStorageKey(session.id)) : null;
      if (stored) {
        try {
          const parsed = JSON.parse(stored) as { completedSections?: Record<number, boolean>; onboardingCompleted?: boolean };
          setCompletedSections(parsed.completedSections || {});
          setOnboardingCompleted(Boolean(parsed.onboardingCompleted));
        } catch {
          setCompletedSections({});
          setOnboardingCompleted(false);
        }
      }
    } catch (loadError) {
      setError(getApiErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function saveProgress(nextSections: Record<number, boolean>, nextCompleted: boolean) {
    if (!user || typeof window === "undefined") return;
    window.localStorage.setItem(
      createStorageKey(user.id),
      JSON.stringify({
        completedSections: nextSections,
        onboardingCompleted: nextCompleted
      })
    );
  }

  function setCompletion(index: number, isComplete: boolean) {
    const next = { ...completedSections, [index]: isComplete };
    setCompletedSections(next);
    saveProgress(next, onboardingCompleted);
  }

  function openSection(index: number) {
    const section = sections[index];
    if (section.external) {
      window.open(section.src, "_blank", "noopener,noreferrer");
      if (!completedSections[index]) {
        setCompletion(index, true);
      }
      return;
    }
    setFullScreenIndex(index);
  }

  function closeSection() {
    if (fullScreenIndex !== null && !completedSections[fullScreenIndex]) {
      setCompletion(fullScreenIndex, true);
    }
    setFullScreenIndex(null);
  }

  function handleSelectFiles(fileList: FileList | null) {
    const nextFiles = fileList ? Array.from(fileList) : [];
    if (!nextFiles.length) return;

    setSelectedUploads((current) => [
      ...current,
      ...nextFiles.map((file, index) => ({
        id: `${file.name}-${file.lastModified}-${current.length + index}`,
        file,
        documentType: requiredDocuments.find((document) => !uploadedFiles.some((uploaded) => uploaded.document_type === document.id))?.id || "Other",
        expiryDate: ""
      }))
    ]);
    setSuccess("");
    setError("");
    setUploadError("");
  }

  function updateSelectedUpload(id: string, updates: Partial<Pick<SelectedUpload, "documentType" | "expiryDate">>) {
    setSelectedUploads((current) => current.map((item) => (item.id === id ? { ...item, ...updates } : item)));
  }

  function removeSelectedUpload(id: string) {
    setSelectedUploads((current) => current.filter((item) => item.id !== id));
  }

  async function submitSelectedUploads() {
    if (!selectedUploads.length) {
      setUploadError("Select at least one onboarding file to upload.");
      return;
    }

    try {
      setUploading(true);
      setError("");
      setSuccess("");
      setUploadError("");
      await uploadHrOnboardingFiles({
        files: await Promise.all(
          selectedUploads.map(async (item) => ({
            fileName: item.file.name,
            fileData: await readFileAsDataUrl(item.file),
            documentType: item.documentType,
            expiryDate: item.expiryDate || null
          }))
        )
      });

      setSelectedUploads([]);
      const filesResponse = await getHrOnboardingFiles();
      setUploadedFiles(filesResponse.items || []);
      setSuccess("Onboarding files uploaded successfully.");
    } catch (uploadError) {
      setUploadError(getFriendlyUploadValidationMessage(uploadError));
    } finally {
      setUploading(false);
    }
  }

  function startEditUploadedFile(file: HrOnboardingFileRecord) {
    setEditingFileId(String(file.id));
    setEditingDocumentType(String(file.document_type || "Other"));
    setEditingExpiryDate(String(file.expiry_date || "").slice(0, 10));
    setSuccess("");
    setError("");
  }

  function cancelEditUploadedFile() {
    setEditingFileId(null);
    setEditingDocumentType("Other");
    setEditingExpiryDate("");
  }

  async function saveUploadedFileChanges(file: HrOnboardingFileRecord) {
    try {
      setSavingFileId(String(file.id));
      setError("");
      setSuccess("");
      await updateHrOnboardingFile(String(file.id), {
        documentType: editingDocumentType,
        expiryDate: editingExpiryDate || null
      });

      const filesResponse = await getHrOnboardingFiles();
      setUploadedFiles(filesResponse.items || []);
      cancelEditUploadedFile();
      setSuccess("Uploaded file details updated.");
    } catch (updateError) {
      setError(getApiErrorMessage(updateError));
    } finally {
      setSavingFileId(null);
    }
  }

  async function removeUploadedFile(file: HrOnboardingFileRecord) {
    const shouldDelete = window.confirm(`Delete ${file.original_file_name}? This cannot be undone.`);
    if (!shouldDelete) {
      return;
    }

    try {
      setDeletingFileId(String(file.id));
      setError("");
      setSuccess("");
      await deleteHrOnboardingFile(String(file.id));
      const filesResponse = await getHrOnboardingFiles();
      setUploadedFiles(filesResponse.items || []);
      if (editingFileId === String(file.id)) {
        cancelEditUploadedFile();
      }
      setSuccess("Uploaded file deleted.");
    } catch (deleteError) {
      setError(getApiErrorMessage(deleteError));
    } finally {
      setDeletingFileId(null);
    }
  }

  function completeOnboarding() {
    setOnboardingCompleted(true);
    saveProgress(completedSections, true);
    setSuccess("Onboarding marked as completed.");
  }

  const completedCount = Object.values(completedSections).filter(Boolean).length;
  const progressPercentage = Math.round((completedCount / sections.length) * 100);
  const allSectionsCompleted = completedCount === sections.length;
  const uploadedDocumentTypes = useMemo(() => new Set(uploadedFiles.map((file) => file.document_type)), [uploadedFiles]);
  const requiredDocsUploaded = requiredDocuments.filter((document) => document.required).every((document) => uploadedDocumentTypes.has(document.id));

  if (loading) {
    return <div className="legacy-empty">Loading onboarding workspace...</div>;
  }

  return (
    <div className="legacy-portal">
      {error ? <div className="hr-card" style={{ marginBottom: 20, color: "#7f1d1d", borderColor: "#fecaca", background: "#fff1f2" }}>{error}</div> : null}
      {success ? <div className="hr-card" style={{ marginBottom: 20, color: "#14532d", borderColor: "#86efac", background: "#f0fdf4" }}>{success}</div> : null}

      <div className="legacy-header">
        <div>
          <h1 className="legacy-header__title">Employee Onboarding</h1>
          <p className="legacy-header__subtitle">Welcome {user?.fullName || "there"}. Complete each onboarding module and submit your onboarding-day documents from one integrated workspace.</p>
          <div className="legacy-role"><UserPlus className="h-4 w-4" />HR Role: {formatHrRoleLabel(hrRole)}</div>
        </div>
        <div className="legacy-stat-card blue" style={{ minWidth: 220 }}>
          <div className="legacy-stat-icon"><CheckCircle2 className="h-5 w-5" /></div>
          <div>
            <p className="legacy-stat-value">{completedCount}/{sections.length}</p>
            <p className="legacy-stat-title">Modules Completed</p>
            <div className="mt-2 h-2 rounded-full bg-slate-200">
              <div className="h-2 rounded-full bg-blue-600" style={{ width: `${progressPercentage}%` }} />
            </div>
          </div>
        </div>
      </div>

      <section className="legacy-grid-cards" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))", marginBottom: 24 }}>
        {sections.map((section, index) => {
          const Icon = section.icon || BookOpen;
          const isCompleted = Boolean(completedSections[index]);
          return (
            <article key={section.title} className="legacy-card legacy-card--compact">
              <div className="legacy-card-header">
                <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flex: 1 }}>
                  <div className="legacy-stat-icon" style={{ width: 44, height: 44 }}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, letterSpacing: "0.12em", textTransform: "uppercase", color: "#64748b", marginBottom: 6 }}>{section.category}</div>
                    <h3 className="legacy-card-title">{section.title}</h3>
                    {section.description ? <p className="legacy-card-copy">{section.description}</p> : null}
                  </div>
                </div>
                <span className={isCompleted ? "legacy-status completed" : "legacy-status"}>{isCompleted ? "Done" : "Pending"}</span>
              </div>
              <div className="legacy-card-body">
                <button type="button" className="w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-950" onClick={() => openSection(index)} title={section.external ? "Open in new window" : "Open module"}>
                  <div style={{ position: "relative", paddingTop: section.tall ? "72%" : "56%" }}>
                    <iframe
                      title={`${section.title} preview`}
                      src={getEmbedSrc(section.src)}
                      loading="lazy"
                      referrerPolicy="no-referrer-when-downgrade"
                      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: "0" }}
                    />
                    <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(15,23,42,0.72), rgba(15,23,42,0.1))", display: "flex", alignItems: "end", justifyContent: "space-between", padding: 16, color: "#fff" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontWeight: 600 }}>
                        <Play className="h-4 w-4" />
                        {section.external ? "Open in new window" : "Open module"}
                      </span>
                      {section.external ? <ExternalLink className="h-4 w-4" /> : null}
                    </div>
                  </div>
                </button>
              </div>
            </article>
          );
        })}
      </section>

      {allSectionsCompleted ? (
        <div className="hr-card" style={{ marginBottom: 24, borderColor: "#bbf7d0", background: "#f0fdf4", color: "#166534" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <CheckCircle className="h-5 w-5" />
            <span>Congrats. Your onboarding training modules are complete. Upload the required onboarding documents below.</span>
          </div>
        </div>
      ) : null}

      <section className="legacy-grid-cards" style={{ gridTemplateColumns: "1.2fr 0.8fr" }}>
        <div className="legacy-card">
          <div className="legacy-card-header">
            <div>
              <h3 className="legacy-card-title">Onboarding-Day Document Upload</h3>
              <p className="legacy-card-copy">Select multiple files at once, assign each file to a required onboarding document type, and upload them into your onboarding folder.</p>
            </div>
          </div>
          <div className="legacy-card-body">
            <div className="legacy-form-section">
              <div className="legacy-form-section__header">
                <h3>Upload Files</h3>
                <p>Supported file types: PDF, Word document, Excel file, JPG, PNG, and TXT.</p>
              </div>
              <div className="legacy-form-section__body">
                <label className="legacy-dropzone" style={{ cursor: "pointer" }}>
                  <input
                    type="file"
                    multiple
                    accept=".pdf,.docx,.xlsx,.jpg,.jpeg,.png,.txt"
                    hidden
                    onChange={(event) => handleSelectFiles(event.target.files)}
                  />
                  <Upload className="h-5 w-5" />
                  <span>Select one or more onboarding files</span>
                </label>

                {selectedUploads.length ? (
                  <div className="mt-4 space-y-3">
                    {selectedUploads.map((item) => (
                      <div key={item.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                        <File className="h-4 w-4 text-slate-500" />
                        <div style={{ flex: 1 }}>
                          <div className="text-sm font-semibold text-slate-900">{item.file.name}</div>
                          <div className="text-xs text-slate-500">{Math.round(item.file.size / 1024)} KB</div>
                        </div>
                        <input
                          type="date"
                          value={item.expiryDate}
                          onChange={(event) => updateSelectedUpload(item.id, { expiryDate: event.target.value })}
                          title="Expiry date"
                        />
                        <select value={item.documentType} onChange={(event) => updateSelectedUpload(item.id, { documentType: event.target.value })}>
                          {requiredDocuments.map((document) => <option key={document.id} value={document.id}>{document.label}</option>)}
                        </select>
                        <button type="button" className="legacy-icon-btn" onClick={() => removeSelectedUpload(item.id)} aria-label={`Remove ${item.file.name}`}>
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}

                <div className="mt-4">
                  <button type="button" className="legacy-primary-btn" onClick={() => void submitSelectedUploads()} disabled={!selectedUploads.length || uploading}>
                    <Send className="h-4 w-4" />
                    {uploading ? "Uploading..." : "Upload Selected Files"}
                  </button>
                </div>
                {uploadError ? <p className="legacy-field-error" style={{ marginTop: 12 }}>{uploadError}</p> : null}
              </div>
            </div>
          </div>
        </div>

        <div className="legacy-card">
          <div className="legacy-card-header">
            <div>
              <h3 className="legacy-card-title">Required Documents</h3>
              <p className="legacy-card-copy">Track which onboarding document types have already been uploaded to your folder.</p>
            </div>
          </div>
          <div className="legacy-card-body">
            <div className="space-y-3">
              {requiredDocuments.map((document) => {
                const uploaded = uploadedDocumentTypes.has(document.id);
                return (
                  <div key={document.id} className="rounded-xl border border-slate-200 px-3 py-3">
                    <div className="flex items-start gap-3">
                      {uploaded ? <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600" /> : <Circle className="mt-0.5 h-5 w-5 text-slate-400" />}
                      <div style={{ flex: 1 }}>
                        <div className="text-sm font-semibold text-slate-900">{document.label}{document.required ? " *" : ""}</div>
                        {document.description ? <div className="text-xs text-slate-500 mt-1">{document.description}</div> : null}
                        {document.linkHref && document.linkLabel ? <a href={document.linkHref} target="_blank" rel="noreferrer" className="text-xs text-blue-700 mt-1 inline-flex">{document.linkLabel}</a> : null}
                        <div className="mt-2 text-xs font-medium" style={{ color: uploaded ? "#059669" : "#64748b" }}>{uploaded ? "Uploaded" : "Pending"}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <section className="legacy-card" style={{ marginTop: 24 }}>
        <div className="legacy-card-header">
          <div>
            <h3 className="legacy-card-title">Uploaded Files</h3>
            <p className="legacy-card-copy">These files are stored in your onboarding folder and remain associated with your account.</p>
          </div>
        </div>
        <div className="legacy-card-body">
          {uploadedFiles.length ? (
            <table className="legacy-table">
              <thead>
                <tr>
                  <th>Document Type</th>
                  <th>File</th>
                  <th>Uploaded</th>
                  <th>Expiry Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {uploadedFiles.map((file) => (
                  <tr key={file.id}>
                    <td>
                      {editingFileId === String(file.id) ? (
                        <select value={editingDocumentType} onChange={(event) => setEditingDocumentType(event.target.value)}>
                          {requiredDocuments.map((document) => <option key={document.id} value={document.id}>{document.label}</option>)}
                        </select>
                      ) : file.document_type}
                    </td>
                    <td>{file.original_file_name}</td>
                    <td>{new Date(file.uploaded_at).toLocaleString()}</td>
                    <td>
                      {editingFileId === String(file.id) ? (
                        <input type="date" value={editingExpiryDate} onChange={(event) => setEditingExpiryDate(event.target.value)} />
                      ) : (file.expiry_date ? new Date(file.expiry_date).toLocaleDateString(undefined, { timeZone: "UTC" }) : "-")}
                    </td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <a
                          href={file.file_url}
                          target="_blank"
                          rel="noreferrer"
                          className="legacy-icon-btn"
                          aria-label={`Open ${file.original_file_name}`}
                          title="Open file"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                        {editingFileId === String(file.id) ? (
                          <>
                            <button
                              type="button"
                              className="legacy-icon-btn"
                              onClick={() => void saveUploadedFileChanges(file)}
                              disabled={savingFileId === String(file.id)}
                              aria-label={`Save changes for ${file.original_file_name}`}
                            >
                              <Save className="h-4 w-4" />
                            </button>
                            <button type="button" className="legacy-icon-btn" onClick={cancelEditUploadedFile} aria-label={`Cancel editing ${file.original_file_name}`}>
                              <X className="h-4 w-4" />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              className="legacy-icon-btn"
                              onClick={() => startEditUploadedFile(file)}
                              aria-label={`Edit ${file.original_file_name}`}
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              className="legacy-icon-btn"
                              onClick={() => void removeUploadedFile(file)}
                              disabled={deletingFileId === String(file.id)}
                              aria-label={`Delete ${file.original_file_name}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <div className="legacy-empty">No onboarding files uploaded yet.</div>}
        </div>
      </section>

      <section className="legacy-card" style={{ marginTop: 24 }}>
        <div className="legacy-card-header">
          <div>
            <h3 className="legacy-card-title">Onboarding Summary</h3>
            <p className="legacy-card-copy">Finish onboarding after all modules and required documents are completed.</p>
          </div>
        </div>
        <div className="legacy-card-body">
          <p className="text-sm text-slate-700">Training Progress: <strong>{completedCount} of {sections.length}</strong> completed {allSectionsCompleted ? <span className="text-emerald-600">✓</span> : null}</p>
          <p className="mt-2 text-sm text-slate-700">Required Documents: <strong>{requiredDocuments.filter((document) => document.required && uploadedDocumentTypes.has(document.id)).length} of {requiredDocuments.filter((document) => document.required).length}</strong> uploaded {requiredDocsUploaded ? <span className="text-emerald-600">✓</span> : null}</p>
          {allSectionsCompleted && requiredDocsUploaded && !onboardingCompleted ? (
            <div className="mt-4">
              <p className="mb-3 text-sm font-medium text-emerald-700">All requirements are complete. You can now finish onboarding.</p>
              <button type="button" className="legacy-primary-btn" onClick={completeOnboarding}>Complete Onboarding Process</button>
            </div>
          ) : null}
          {onboardingCompleted ? <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">Onboarding completed successfully. Welcome to the team.</div> : null}
        </div>
      </section>

      {fullScreenIndex !== null ? (
        <div className="legacy-modal-overlay" style={{ padding: 20 }}>
          <div className="legacy-modal legacy-modal--wide" style={{ maxWidth: "96vw", width: "96vw", height: "92vh" }}>
            <div className="legacy-modal-header">
              <h2>{sections[fullScreenIndex].title}</h2>
              <button type="button" className="legacy-icon-btn" onClick={closeSection}><X className="h-4 w-4" /></button>
            </div>
            <div className="legacy-modal-body" style={{ height: "calc(92vh - 88px)" }}>
              <iframe
                title={sections[fullScreenIndex].title}
                src={getEmbedSrc(sections[fullScreenIndex].src)}
                referrerPolicy="no-referrer-when-downgrade"
                style={{ width: "100%", height: "100%", border: 0, borderRadius: 16 }}
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
