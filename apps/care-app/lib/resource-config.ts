import type { NavItem, ResourceConfig } from "@vlworkhub/types";
import { platformLinks } from "@vlworkhub/config";

export const careNav: NavItem[] = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Clients", href: "/clients" },
  { label: "Staff", href: "/staff" },
  { label: "Case Notes", href: "/notes" },
  { label: "Incidents", href: "/incidents" },
  { label: "Documents", href: "/documents" }
];

export const careMeta = {
  appName: "Care System",
  rootHref: `${platformLinks.root}/dashboard`
};

export const careResources: Record<string, ResourceConfig> = {
  clients: {
    title: "Client Records",
    description: "Core client profiles, service status, and program ownership.",
    resource: "clients",
    columns: [
      { key: "full_name", label: "Client" },
      { key: "status", label: "Status" },
      { key: "program", label: "Program" },
      { key: "primary_contact", label: "Primary Contact" }
    ],
    fields: ["full_name", "status", "program", "primary_contact"]
  },
  staff: {
    title: "Staff Management",
    description: "Site administrator workflow for employee records, manager ownership, and staff lifecycle state.",
    resource: "staff",
    columns: [
      { key: "full_name", label: "Staff" },
      { key: "role", label: "Role" },
      { key: "department", label: "Department" },
      { key: "manager_name", label: "Manager" },
      { key: "status", label: "Status" }
    ],
    fields: ["full_name", "role", "email", "phone", "department", "manager_name", "status"]
  },
  notes: {
    title: "Case Notes",
    description: "Client note capture with visibility control and staff ownership.",
    resource: "notes",
    columns: [
      { key: "client_id", label: "Client ID" },
      { key: "staff_id", label: "Staff ID" },
      { key: "note_text", label: "Note" },
      { key: "visibility", label: "Visibility" }
    ],
    fields: ["client_id", "staff_id", "note_text", "visibility"]
  },
  incidents: {
    title: "Incident Reports",
    description: "Operational incident intake, severity tracking, and resolution state.",
    resource: "incidents",
    columns: [
      { key: "title", label: "Title" },
      { key: "severity", label: "Severity" },
      { key: "reported_by", label: "Reported By" },
      { key: "status", label: "Status" }
    ],
    fields: ["title", "severity", "reported_by", "status"]
  },
  documents: {
    title: "Document Storage",
    description: "Managed document index for care-related files and evidence.",
    resource: "documents",
    columns: [
      { key: "title", label: "Title" },
      { key: "category", label: "Category" },
      { key: "owner_name", label: "Owner" },
      { key: "storage_path", label: "Storage Path" }
    ],
    fields: ["title", "category", "owner_name", "storage_path"]
  }
};
