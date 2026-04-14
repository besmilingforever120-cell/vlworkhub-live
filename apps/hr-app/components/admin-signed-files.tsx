"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ChevronDown, ChevronRight, Download, FolderOpen, Search, Shield } from "lucide-react";
import { getApiErrorMessage, getHrSignedDocumentFiles, type HrSignedDocumentFileRecord } from "../lib/hr-client";

function formatDate(value: string | null) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

function statusBadgeClass(archived: boolean) {
  return archived ? "legacy-status archived" : "legacy-status completed";
}

export function AdminSignedFiles() {
  const [items, setItems] = useState<HrSignedDocumentFileRecord[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set());

  async function load() {
    try {
      setLoading(true);
      setError("");
      const response = await getHrSignedDocumentFiles();
      setItems(response.items || []);
    } catch (loadError) {
      setItems([]);
      setError(getApiErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return items;
    return items.filter((item) => [item.signer_name, item.signer_email, item.document_name, item.signature_id || "", item.document_status].join(" ").toLowerCase().includes(normalizedQuery));
  }, [items, query]);

  const groupedItems = useMemo(() => {
    const groups = new Map<string, HrSignedDocumentFileRecord[]>();
    for (const item of filteredItems) {
      const key = item.signer_name || "Unknown User";
      const current = groups.get(key) || [];
      current.push(item);
      groups.set(key, current);
    }
    return Array.from(groups.entries()).map(([signerName, files]) => ({
      signerName,
      signerEmail: files[0]?.signer_email || "",
      files
    }));
  }, [filteredItems]);

  function toggleUserExpansion(signerName: string) {
    setExpandedUsers((current) => {
      const next = new Set(current);
      if (next.has(signerName)) {
        next.delete(signerName);
      } else {
        next.add(signerName);
      }
      return next;
    });
  }

  return (
    <div className="legacy-portal">
      <div className="legacy-header">
        <div>
          <h1 className="legacy-header__title">Signed User Files</h1>
          <p className="legacy-header__subtitle">Review signed document copies grouped by signer folder, including archived and active source documents.</p>
          <div className="legacy-role"><Shield className="h-4 w-4" />Admin-only document audit view</div>
        </div>
        <Link href="/admin" className="legacy-secondary-btn"><ArrowLeft className="h-4 w-4" />Back to Admin</Link>
      </div>

      {error ? <div className="hr-card" style={{ marginBottom: 20, color: "#7f1d1d", borderColor: "#fecaca", background: "#fff1f2" }}>{error}</div> : null}

      <section className="legacy-stats-grid">
        <div className="legacy-stat-card blue"><div className="legacy-stat-icon"><FolderOpen className="h-5 w-5" /></div><div><p className="legacy-stat-value">{groupedItems.length}</p><p className="legacy-stat-title">User Folders</p></div></div>
        <div className="legacy-stat-card green"><div className="legacy-stat-icon"><Download className="h-5 w-5" /></div><div><p className="legacy-stat-value">{filteredItems.length}</p><p className="legacy-stat-title">Signed Files</p></div></div>
      </section>

      <section className="legacy-toolbar">
        <div className="legacy-toolbar__row">
          <div className="legacy-search"><Search className="h-4 w-4" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search signer or file..." /></div>
        </div>
      </section>

      {loading ? <div className="legacy-empty">Loading signed files...</div> : null}

      {!loading && !groupedItems.length ? <div className="legacy-empty">No signed files found.</div> : null}

      {!loading ? groupedItems.map((group) => (
        <section key={group.signerName} className="legacy-card" style={{ marginBottom: 20 }}>
          <button
            type="button"
            className="legacy-card-header"
            style={{ width: "100%", justifyContent: "space-between", alignItems: "center", textAlign: "left", cursor: "pointer", background: "transparent", border: "none" }}
            onClick={() => toggleUserExpansion(group.signerName)}
            aria-expanded={expandedUsers.has(group.signerName)}
          >
            <h3 className="legacy-card-title">{group.signerName}</h3>
            <span className="text-slate-500" aria-hidden="true">
              {expandedUsers.has(group.signerName) ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
            </span>
          </button>

          {expandedUsers.has(group.signerName) ? <div className="mt-5 overflow-x-auto">
            <table className="min-w-full text-left text-sm text-gray-700">
              <thead className="text-xs uppercase tracking-[0.16em] text-gray-500">
                <tr>
                  <th className="px-3 py-3">Document</th>
                  <th className="px-3 py-3">Signed At</th>
                  <th className="px-3 py-3">Source Status</th>
                  <th className="px-3 py-3">Signature ID</th>
                  <th className="px-3 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {group.files.map((file) => (
                  <tr key={file.id} className="border-t border-gray-200">
                    <td className="px-3 py-4">
                      <div className="text-sm font-semibold text-gray-900">{file.document_name}</div>
                    </td>
                    <td className="px-3 py-4 text-sm text-gray-700">{formatDate(file.signed_at)}</td>
                    <td className="px-3 py-4"><span className={statusBadgeClass(file.archived)}>{file.archived ? "Archived" : file.document_status || "Active"}</span></td>
                    <td className="px-3 py-4 text-xs text-gray-500">{file.signature_id || "-"}</td>
                    <td className="px-3 py-4">
                      <div className="flex items-center gap-2">
                        {file.signed_file_url ? <button type="button" className="legacy-secondary-btn" onClick={() => window.open(file.signed_file_url || "", "_blank", "noopener,noreferrer")}>Open</button> : <span className="text-slate-400">No file</span>}
                        {file.signed_file_url ? <button type="button" className="legacy-icon-btn" title="Download signed file" onClick={() => window.open(file.signed_file_url || "", "_blank", "noopener,noreferrer")}><Download className="h-4 w-4" /></button> : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div> : null}
        </section>
      )) : null}
    </div>
  );
}
