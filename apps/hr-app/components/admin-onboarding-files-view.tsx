"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarClock, FileText, FolderOpen, Search, Shield } from "lucide-react";
import {
  getAdminHrOnboardingFiles,
  getApiErrorMessage,
  getPlatformUsers,
  type HrOnboardingFileRecord,
  type PlatformUserRecord
} from "../lib/hr-client";

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
      </div>

      {error ? <div className="hr-card" style={{ marginBottom: 20, color: "#7f1d1d", borderColor: "#fecaca", background: "#fff1f2" }}>{error}</div> : null}

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
                    <td>{file.document_type}</td>
                    <td>{file.original_file_name}</td>
                    <td>{new Date(file.uploaded_at).toLocaleString()}</td>
                    <td>
                      <span className={isExpired(file.expiry_date) ? "legacy-status overdue" : "legacy-status"}>
                        {formatDate(file.expiry_date)}
                      </span>
                    </td>
                    <td><a href={file.file_url} target="_blank" rel="noreferrer" className="legacy-secondary-btn">Open</a></td>
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
