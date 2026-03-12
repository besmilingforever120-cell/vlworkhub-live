"use client";

import { useEffect, useMemo, useState } from "react";
import { Pencil, Plus, Search, Trash2, X } from "lucide-react";
import type { SessionUser } from "@vlworkhub/types";
import {
  createResource,
  deleteResource,
  getApiErrorMessage,
  getCurrentUser,
  getResource,
  updateResource,
  type CareRecord
} from "../../lib/care-client";

const STATUS_OPTIONS = ["All", "Active", "Pending", "Waitlist", "Discharged"] as const;
type StatusFilter = (typeof STATUS_OPTIONS)[number];

type ClientForm = {
  full_name: string;
  status: string;
  program: string;
  primary_contact: string;
};

function emptyForm(): ClientForm {
  return {
    full_name: "",
    status: "Active",
    program: "Community Inclusion",
    primary_contact: ""
  };
}

export default function ClientsPage() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [clients, setClients] = useState<CareRecord[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("All");
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<ClientForm>(emptyForm());
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function load() {
    try {
      setError(null);
      const [session, clientItems] = await Promise.all([getCurrentUser(), getResource("clients")]);
      setUser(session);
      setClients(clientItems);
      setSelectedClientId((current) => current ?? Number(clientItems[0]?.id ?? null));
    } catch (loadError) {
      setError(getApiErrorMessage(loadError));
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const filteredClients = useMemo(() => {
    const query = search.trim().toLowerCase();
    return clients.filter((client) => {
      const statusMatches = statusFilter === "All" || String(client.status || "").toLowerCase() === statusFilter.toLowerCase();
      if (!statusMatches) return false;
      if (!query) return true;
      return [client.full_name, client.program, client.primary_contact]
        .map((value) => String(value || "").toLowerCase())
        .some((value) => value.includes(query));
    });
  }, [clients, search, statusFilter]);

  const selectedClient = useMemo(
    () => filteredClients.find((client) => Number(client.id) === selectedClientId) || filteredClients[0] || null,
    [filteredClients, selectedClientId]
  );

  const activeCount = clients.filter((client) => String(client.status || "").toLowerCase() === "active").length;
  const programCount = new Set(clients.map((client) => String(client.program || "")).filter(Boolean)).size;
  const contactCoverage = clients.filter((client) => String(client.primary_contact || "").trim().length > 0).length;

  function openCreateModal() {
    setEditingId(null);
    setForm(emptyForm());
    setIsModalOpen(true);
  }

  function openEditModal(client: CareRecord) {
    setEditingId(Number(client.id));
    setForm({
      full_name: String(client.full_name || ""),
      status: String(client.status || "Active"),
      program: String(client.program || ""),
      primary_contact: String(client.primary_contact || "")
    });
    setIsModalOpen(true);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      setIsSaving(true);
      if (editingId) {
        await updateResource("clients", editingId, form);
      } else {
        await createResource("clients", form);
      }
      setIsModalOpen(false);
      setForm(emptyForm());
      setEditingId(null);
      await load();
    } catch (submitError) {
      setError(getApiErrorMessage(submitError));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(id: number) {
    try {
      await deleteResource("clients", id);
      if (selectedClientId === id) {
        setSelectedClientId(null);
      }
      await load();
    } catch (deleteError) {
      setError(getApiErrorMessage(deleteError));
    }
  }

  return (
    <div className="care-page">
      <header className="care-topbar">
        <div className="care-topbar__brand">
          <div className="care-logo">VC</div>
          <div>
            <p className="care-topbar__system">Individuals Workspace</p>
            <p className="care-topbar__organization">Client Management</p>
          </div>
        </div>
        <div className="care-topbar__meta">
          <span className="care-live-dot" />
          <span>Live data from shared API</span>
          <span className="care-user-pill">{user ? user.fullName : "Loading session"}</span>
        </div>
      </header>

      <div className="care-content">
        {error ? <div className="care-error">{error}</div> : null}

        <section className="care-card care-card--full">
          <div className="care-headline">
            <div>
              <h2>Individuals Management</h2>
              <p>Legacy table, filter, search, and detail-pane placement restored for care productivity.</p>
            </div>
            <button onClick={openCreateModal} className="care-primary-btn" type="button">
              + Add Client
            </button>
          </div>
          <div className="care-metrics">
            <div className="care-metric">
              <p className="care-metric__label">Individuals</p>
              <p className="care-metric__value">{clients.length}</p>
              <p className="care-metric__helper">Active and historical client profiles</p>
            </div>
            <div className="care-metric">
              <p className="care-metric__label">Active Support</p>
              <p className="care-metric__value">{activeCount}</p>
              <p className="care-metric__helper">Clients currently marked active</p>
            </div>
            <div className="care-metric">
              <p className="care-metric__label">Programs</p>
              <p className="care-metric__value">{programCount}</p>
              <p className="care-metric__helper">{contactCoverage}/{clients.length || 0} with primary contacts assigned</p>
            </div>
          </div>
        </section>

        <div className="care-data-layout">
          <section className="care-card">
            <div className="care-toolbar">
              <div className="care-searchbar">
                <Search className="h-4 w-4 text-slate-500" />
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by client, program, or primary contact" />
              </div>
              <div className="care-filterbar">
                {STATUS_OPTIONS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setStatusFilter(option)}
                    className={`care-filter-btn ${statusFilter === option ? "is-selected" : ""}`}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>

            <div className="care-table-wrapper">
              <table className="care-table">
                <thead>
                  <tr>
                    <th>Client</th>
                    <th>Program</th>
                    <th>Status</th>
                    <th>Primary Contact</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredClients.map((client) => {
                    const clientId = Number(client.id);
                    const selected = selectedClient?.id === client.id;
                    return (
                      <tr key={clientId} className={selected ? "is-selected" : undefined}>
                        <td>
                          <button type="button" onClick={() => setSelectedClientId(clientId)} className="text-left">
                            <p className="care-name">{String(client.full_name || "Unnamed Client")}</p>
                            <span className="care-subtext">Record #{clientId}</span>
                          </button>
                        </td>
                        <td>{String(client.program || "Unassigned")}</td>
                        <td>
                          <span className={`care-status-pill ${String(client.status || "").toLowerCase() === "active" ? "is-active" : ""}`}>
                            {String(client.status || "Unknown")}
                          </span>
                        </td>
                        <td>{String(client.primary_contact || "Not assigned")}</td>
                        <td>
                          <div className="care-filterbar" style={{ justifyContent: "flex-end" }}>
                            <button type="button" className="care-mini-btn" onClick={() => openEditModal(client)}>
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button type="button" className="care-mini-btn" onClick={() => void handleDelete(clientId)}>
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredClients.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="care-muted">No client records match the current filters.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>

          <section className="care-card">
            <div className="care-card__header">
              <div>
                <p className="care-panel-note">Selected Individual</p>
                <h3>Detail Pane</h3>
              </div>
            </div>
            {selectedClient ? (
              <div className="care-detail-stack">
                <div className="care-detail-box">
                  <p className="care-subtext">Client</p>
                  <h3>{String(selectedClient.full_name || "Unnamed Client")}</h3>
                  <p>{String(selectedClient.program || "Not assigned")}</p>
                </div>
                <div className="care-detail-box">
                  <p className="care-subtext">Status</p>
                  <p>{String(selectedClient.status || "Unknown")}</p>
                </div>
                <div className="care-detail-box">
                  <p className="care-subtext">Primary Contact</p>
                  <p>{String(selectedClient.primary_contact || "Not assigned")}</p>
                </div>
                <div className="care-detail-box">
                  <p className="care-subtext">Workflow</p>
                  <p>Keep client intake, assignment, and case-note workflows grouped around this record.</p>
                </div>
                <button type="button" className="care-primary-btn is-dark" onClick={() => openEditModal(selectedClient)}>
                  Edit Client Record
                </button>
              </div>
            ) : (
              <div className="care-detail-box">
                <p>Select a client to inspect the record details.</p>
              </div>
            )}
          </section>
        </div>
      </div>

      {isModalOpen ? (
        <div className="care-modal">
          <div className="care-modal__backdrop" onClick={() => setIsModalOpen(false)} aria-hidden="true" />
          <section className="care-modal__panel" role="dialog" aria-modal="true" aria-labelledby="careClientModalTitle">
            <div className="care-card__header">
              <div>
                <p className="care-panel-note">{editingId ? "Update Client" : "Create Client"}</p>
                <h3 id="careClientModalTitle">{editingId ? "Edit client record" : "Add a new client"}</h3>
              </div>
              <button type="button" className="care-modal__close" onClick={() => setIsModalOpen(false)}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="care-form-grid">
              <label className="care-field care-field--full">
                <span>Client Name</span>
                <input value={form.full_name} onChange={(event) => setForm((current) => ({ ...current, full_name: event.target.value }))} required />
              </label>
              <label className="care-field">
                <span>Status</span>
                <select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}>
                  {STATUS_OPTIONS.filter((option) => option !== "All").map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </label>
              <label className="care-field">
                <span>Program</span>
                <input value={form.program} onChange={(event) => setForm((current) => ({ ...current, program: event.target.value }))} required />
              </label>
              <label className="care-field care-field--full">
                <span>Primary Contact</span>
                <input value={form.primary_contact} onChange={(event) => setForm((current) => ({ ...current, primary_contact: event.target.value }))} />
              </label>
              <div className="care-form-actions">
                <button type="button" onClick={() => setIsModalOpen(false)}>Cancel</button>
                <button type="submit" className="care-primary-btn">{isSaving ? "Saving..." : editingId ? "Update Client" : "Create Client"}</button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </div>
  );
}
