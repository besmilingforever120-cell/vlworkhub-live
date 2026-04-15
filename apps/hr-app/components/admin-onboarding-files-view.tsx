"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CalendarClock, ExternalLink, FileText, FolderOpen, Pencil, Save, Search, Shield, Trash2, X } from "lucide-react";
import {
  deleteAdminHrOnboardingFile,
  getAdminHrOnboardingFiles,
  getApiErrorMessage,
  getPlatformUsers,
  updateAdminHrOnboardingFile,
  type HrOnboardingFileRecord,
  type PlatformUserRecord
} from "../lib/hr-client";

const onboardingDocumentTypes = [
  "Banking info",
  "Certificates",
  "Food Safe",
  "WHIMS",
  "First Aid",
  "Mandt Certificate",
  "Other",
  "TB Test Results",
  "Driver's License (Front and Back)",
  "Proof of Vaccinations",
  "Driver's abstract"
] as const;

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString();
}

function isExpired(value: string | null | undefined) {
  if (!value) return false;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  parsed.setHours(0, 0, 0, 0);
  return parsed < today;
}

export function AdminOnboardingFilesView() {
  const [users, setUsers] = useState<PlatformUserRecord[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [items, setItems] = useState<HrOnboardingFileRecord[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [filesLoading, setFilesLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [editingFileId, setEditingFileId] = useState<string | null>(null);
  const [editingDocumentType, setEditingDocumentType] = useState("Other");
  const [editingExpiryDate, setEditingExpiryDate] = useState("");
  const [savingFileId, setSavingFileId] = useState<string | null>(null);
  const [deletingFileId, setDeletingFileId] = useState<string | null>(null);

  async function loadUsers() {
    try {
      setLoading(true);
      setError("");
      const response = await getPlatformUsers();
      const nextUsers = response.items || [];
      setUsers(nextUsers);
      if (nextUsers.length) {
        setSelectedUserId((current) => current || nextUsers[0].id);
      }
    } catch (loadError) {
      setUsers([]);
      setError(getApiErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadUsers();
  }, []);

  function beginEdit(file: HrOnboardingFileRecord) {
    setEditingFileId(String(file.id));
    setEditingDocumentType(String(file.document_type || "Other"));
    setEditingExpiryDate(String(file.expiry_date || "").slice(0, 10));
    setSuccess("");
    setError("");
  }

  function cancelEdit() {
    setEditingFileId(null);
    setEditingDocumentType("Other");
    setEditingExpiryDate("");
  }

  useEffect(() => {
    if (!selectedUserId) {
      setItems([]);
      return;
    }

    async function loadFiles() {
      try {
        setFilesLoading(true);
        setError("");
        const response = await getAdminHrOnboardingFiles(selectedUserId);
        setItems(response.items || []);
      } catch (loadError) {
        setItems([]);
        setError(getApiErrorMessage(loadError));
      } finally {
        setFilesLoading(false);
      }
    }

    void loadFiles();
  }, [selectedUserId]);

  useEffect(() => {
    cancelEdit();
  }, [selectedUserId]);

  async function refreshFiles() {
    if (!selectedUserId) {
      setItems([]);
      return;
    }

    const response = await getAdminHrOnboardingFiles(selectedUserId);
    setItems(response.items || []);
  }

  async function saveItem(file: HrOnboardingFileRecord) {
    if (!selectedUserId) {
      return;
    }

    try {
      setSavingFileId(String(file.id));
      setError("");
      setSuccess("");
      await updateAdminHrOnboardingFile(selectedUserId, String(file.id), {
        documentType: editingDocumentType,
        expiryDate: editingExpiryDate || null
      });
      await refreshFiles();
      cancelEdit();
      setSuccess("Onboarding file updated.");
    } catch (saveError) {
      setError(getApiErrorMessage(saveError));
    } finally {
      setSavingFileId(null);
    }
  }

  async function deleteItem(file: HrOnboardingFileRecord) {
    if (!selectedUserId) {
      return;
    }

    const shouldDelete = window.confirm(`Delete ${file.original_file_name}? This cannot be undone.`);
    if (!shouldDelete) {
      return;
    }

    try {
      setDeletingFileId(String(file.id));
      setError("");
      setSuccess("");
      await deleteAdminHrOnboardingFile(selectedUserId, String(file.id));
      await refreshFiles();
      if (editingFileId === String(file.id)) {
        cancelEdit();
      }
      setSuccess("Onboarding file deleted.");
    } catch (deleteError) {
      setError(getApiErrorMessage(deleteError));
    } finally {
      setDeletingFileId(null);
    }
  }

  const selectedUser = useMemo(() => users.find((user) => user.id === selectedUserId) || null, [users, selectedUserId]);

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return items;
    return items.filter((item) =>
      [item.original_file_name, item.document_type, item.user_name || "", item.user_email || ""]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery)
    );
  }, [items, query]);

  return (
    <div className="legacy-portal">
      <div className="legacy-header">
        <div>
          <h1 className="legacy-header__title">Employee Onboarding Files</h1>
          <p className="legacy-header__subtitle">Select an employee and review the onboarding files stored in that employee’s onboarding folder.</p>
          <div className="legacy-role"><Shield className="h-4 w-4" />Admin-only onboarding document view</div>
        </div>
        <Link href="/admin" className="legacy-secondary-btn"><ArrowLeft className="h-4 w-4" />Back to Admin</Link>
      </div>

      {error ? <div className="hr-card" style={{ marginBottom: 20, color: "#7f1d1d", borderColor: "#fecaca", background: "#fff1f2" }}>{error}</div> : null}
      {success ? <div className="hr-card" style={{ marginBottom: 20, color: "#14532d", borderColor: "#86efac", background: "#f0fdf4" }}>{success}</div> : null}

      <section className="legacy-stats-grid">
        <div className="legacy-stat-card blue"><div className="legacy-stat-icon"><FolderOpen className="h-5 w-5" /></div><div><p className="legacy-stat-value">{users.length}</p><p className="legacy-stat-title">Platform Users</p></div></div>
        <div className="legacy-stat-card green"><div className="legacy-stat-icon"><FileText className="h-5 w-5" /></div><div><p className="legacy-stat-value">{filteredItems.length}</p><p className="legacy-stat-title">Uploaded Files</p></div></div>
        <div className="legacy-stat-card amber"><div className="legacy-stat-icon"><CalendarClock className="h-5 w-5" /></div><div><p className="legacy-stat-value">{filteredItems.filter((item) => isExpired(item.expiry_date)).length}</p><p className="legacy-stat-title">Expired Files</p></div></div>
      </section>

      <section className="legacy-toolbar">
        <div className="legacy-toolbar__row" style={{ display: "grid", gridTemplateColumns: "minmax(280px, 360px) minmax(260px, 1fr)", gap: 16, alignItems: "center" }}>
          <select value={selectedUserId} onChange={(event) => setSelectedUserId(event.target.value)} disabled={loading}>
            <option value="">Select employee</option>
            {users.map((user) => <option key={user.id} value={user.id}>{user.name} ({user.email})</option>)}
          </select>
          <div className="legacy-search"><Search className="h-4 w-4" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search uploaded files..." /></div>
        </div>
      </section>

      {selectedUser ? (
        <div className="hr-card" style={{ marginBottom: 20 }}>
          <div className="text-sm font-semibold text-slate-900">{selectedUser.name}</div>
          <div className="text-xs text-slate-500">{selectedUser.email}</div>
        </div>
      ) : null}

      {filesLoading ? <div className="legacy-empty">Loading onboarding files...</div> : null}
      {!filesLoading && selectedUserId && !filteredItems.length ? <div className="legacy-empty">No onboarding files found for the selected user.</div> : null}

      {!filesLoading && filteredItems.length ? (
        <section className="legacy-card">
          <div className="legacy-card-header">
            <div>
              <h3 className="legacy-card-title">Uploaded Files</h3>
              <p className="legacy-card-copy">These files mirror the Uploaded Files section from the employee onboarding page.</p>
            </div>
          </div>
          <div className="legacy-card-body">
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
                {filteredItems.map((file) => (
                  <tr key={file.id}>
                    <td>
                      {editingFileId === String(file.id) ? (
                        <select value={editingDocumentType} onChange={(event) => setEditingDocumentType(event.target.value)}>
                          {onboardingDocumentTypes.map((documentType) => <option key={documentType} value={documentType}>{documentType}</option>)}
                        </select>
                      ) : file.document_type}
                    </td>
                    <td>{file.original_file_name}</td>
                    <td>{new Date(file.uploaded_at).toLocaleString()}</td>
                    <td>
                      {editingFileId === String(file.id) ? (
                        <input type="date" value={editingExpiryDate} onChange={(event) => setEditingExpiryDate(event.target.value)} />
                      ) : (
                        <span className={isExpired(file.expiry_date) ? "legacy-status overdue" : "legacy-status"}>
                          {formatDate(file.expiry_date)}
                        </span>
                      )}
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
                              onClick={() => void saveItem(file)}
                              disabled={savingFileId === String(file.id)}
                              aria-label={`Save changes for ${file.original_file_name}`}
                            >
                              <Save className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              className="legacy-icon-btn"
                              onClick={cancelEdit}
                              aria-label={`Cancel editing ${file.original_file_name}`}
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              className="legacy-icon-btn"
                              onClick={() => beginEdit(file)}
                              aria-label={`Edit ${file.original_file_name}`}
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              className="legacy-icon-btn"
                              onClick={() => void deleteItem(file)}
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
          </div>
        </section>
      ) : null}
    </div>
  );
}
