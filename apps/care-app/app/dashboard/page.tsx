"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { platformLinks } from "@vlworkhub/config";
import type { SessionUser } from "@vlworkhub/types";
import { careDashboardReference } from "../../lib/dashboard-content";
import { getApiErrorMessage, getCurrentUser, getResource, type CareRecord } from "../../lib/care-client";

export default function CareDashboardPage() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [clients, setClients] = useState<CareRecord[]>([]);
  const [staff, setStaff] = useState<CareRecord[]>([]);
  const [notes, setNotes] = useState<CareRecord[]>([]);
  const [incidents, setIncidents] = useState<CareRecord[]>([]);
  const [documents, setDocuments] = useState<CareRecord[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        setError(null);
        const [session, clientItems, staffItems, noteItems, incidentItems, documentItems] = await Promise.all([
          getCurrentUser(),
          getResource("clients"),
          getResource("staff"),
          getResource("notes"),
          getResource("incidents"),
          getResource("documents")
        ]);
        setUser(session);
        setClients(clientItems);
        setStaff(staffItems);
        setNotes(noteItems);
        setIncidents(incidentItems);
        setDocuments(documentItems);
      } catch (loadError) {
        setError(getApiErrorMessage(loadError));
      }
    }

    void load();
  }, []);

  const openIncidents = useMemo(
    () => incidents.filter((item) => String(item.status || "").toLowerCase() !== "mitigated" && String(item.status || "").toLowerCase() !== "resolved"),
    [incidents]
  );

  return (
    <div className="care-page">
      <header className="care-topbar">
        <div className="care-topbar__brand">
          <div className="care-logo">VC</div>
          <div>
            <p className="care-topbar__system">{careDashboardReference.systemLabel}</p>
            <p className="care-topbar__organization">{careDashboardReference.organizationName}</p>
          </div>
        </div>
        <div className="care-topbar__meta">
          <span className="care-live-dot" />
          <span>Live monitoring connected</span>
          <span className="care-user-pill">{user ? user.fullName : "Session loading"}</span>
          <Link href={`${platformLinks.root}/dashboard`} className="care-link-pill">
            Back to VLWorkHub
          </Link>
        </div>
      </header>

      <div className="care-content">
        {error ? <div className="care-error">{error}</div> : null}

        <section className="care-card care-card--full">
          <div className="care-headline">
            <div>
              <h2>Home Dashboard</h2>
              <p>Legacy Care structure restored on top of shared auth and shared API resources.</p>
            </div>
            <p>{careDashboardReference.spotlight.description}</p>
          </div>
          <div className="care-metrics">
            <div className="care-metric">
              <p className="care-metric__label">Individuals</p>
              <p className="care-metric__value">{clients.length}</p>
              <p className="care-metric__helper">Client records in care</p>
            </div>
            <div className="care-metric">
              <p className="care-metric__label">Staff</p>
              <p className="care-metric__value">{staff.length}</p>
              <p className="care-metric__helper">Assigned care staff</p>
            </div>
            <div className="care-metric">
              <p className="care-metric__label">Case Notes</p>
              <p className="care-metric__value">{notes.length}</p>
              <p className="care-metric__helper">Recent service notes</p>
            </div>
          </div>
        </section>

        <div className="care-main-grid">
          <section className="care-card">
            <div className="care-card__header">
              <div>
                <p className="care-panel-note">Quick Start</p>
                <h3>Launcher Tiles</h3>
              </div>
              <small>Legacy dashboard placement preserved</small>
            </div>
            <div className="care-quick-grid">
              {careDashboardReference.quickStartItems.map((item) => (
                <Link key={item.label} href={item.href} className="care-quick-tile">
                  <span className="care-quick-icon">{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              ))}
            </div>
          </section>

          <section className="care-card">
            <div className="care-card__header">
              <div>
                <p className="care-panel-note">Announcements</p>
                <h3>Agency Updates</h3>
              </div>
            </div>
            <ul className="care-list">
              {careDashboardReference.announcements.map((announcement) => (
                <li key={announcement.id}>
                  <div>
                    <span className="care-chip">{announcement.category}</span>
                    <p>{announcement.title}</p>
                  </div>
                  <small>{announcement.timestamp}</small>
                </li>
              ))}
            </ul>
          </section>

          <section className="care-card care-card--spotlight">
            <div className="care-spotlight">
              <div className="care-spotlight__image">VC</div>
              <div>
                <h3>{careDashboardReference.spotlight.title}</h3>
                <p>{careDashboardReference.spotlight.description}</p>
              </div>
            </div>
          </section>

          <section className="care-card">
            <div className="care-card__header">
              <div>
                <p className="care-panel-note">All Events Calendar</p>
                <h3>Upcoming Events</h3>
              </div>
            </div>
            <div className="care-content" style={{ gap: "10px", marginTop: 0 }}>
              {careDashboardReference.events.map((event) => (
                <div key={`${event.date}-${event.title}`} className="care-calendar-item">
                  <p className="care-subtext">{event.date}</p>
                  <p>{event.title}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="care-card">
            <div className="care-card__header">
              <div>
                <p className="care-panel-note">Incident Queue</p>
                <h3>Critical Incidents</h3>
              </div>
              <span className="care-status-pill is-archived">{openIncidents.length}</span>
            </div>
            <ul className="care-list">
              {openIncidents.length === 0 ? (
                <li>
                  <p>No open incidents are currently flagged.</p>
                </li>
              ) : (
                openIncidents.map((incident) => (
                  <li key={String(incident.id)}>
                    <div>
                      <span className="care-chip">{String(incident.severity || "Incident")}</span>
                      <p>{String(incident.title || "Untitled incident")}</p>
                      <small>Reported by {String(incident.reported_by || "Unknown")}</small>
                    </div>
                    <button className="care-mini-btn" type="button">Review</button>
                  </li>
                ))
              )}
            </ul>
          </section>

          <section className="care-card care-card--full">
            <div className="care-card__header">
              <div>
                <p className="care-panel-note">Live Alerts</p>
                <h3>Rotating Operational Signals</h3>
              </div>
            </div>
            <ul className="care-alert-list">
              {careDashboardReference.rotatingAlerts.map((alert) => (
                <li key={alert}>{alert}</li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
