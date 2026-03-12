import type { NavItem, ResourceConfig } from "@vlworkhub/types";
import { platformLinks } from "@vlworkhub/config";

export const hrNav: NavItem[] = [
  { label: "Dashboard", href: "/" },
  { label: "Employees", href: "/employees" },
  { label: "Announcements", href: "/announcements" },
  { label: "Tasks", href: "/tasks" },
  { label: "Training", href: "/training" },
  { label: "Documents", href: "/documents" },
  { label: "Admin", href: "/admin" }
];

export const hrMeta = {
  appName: "HR System",
  rootHref: `${platformLinks.root}/dashboard`
};

export const hrResources: Record<string, ResourceConfig> = {
  employees: {
    title: "Employee Directory",
    description: "Searchable employee records migrated from the SharePoint HR portal.",
    resource: "employees",
    columns: [
      { key: "full_name", label: "Employee" },
      { key: "department", label: "Department" },
      { key: "job_title", label: "Job Title" },
      { key: "email", label: "Email" }
    ],
    fields: ["full_name", "department", "job_title", "email"]
  },
  announcements: {
    title: "Announcements",
    description: "Internal communications and policy updates for the organization.",
    resource: "announcements",
    columns: [
      { key: "title", label: "Title" },
      { key: "audience", label: "Audience" },
      { key: "publish_date", label: "Publish Date" },
      { key: "status", label: "Status" }
    ],
    fields: ["title", "audience", "publish_date", "status"]
  },
  tasks: {
    title: "Tasks",
    description: "Track HR assignments, deadlines, and owners across teams.",
    resource: "tasks",
    columns: [
      { key: "title", label: "Task" },
      { key: "assigned_to", label: "Assigned To" },
      { key: "due_date", label: "Due Date" },
      { key: "status", label: "Status" }
    ],
    fields: ["title", "assigned_to", "due_date", "status"]
  },
  training: {
    title: "Training Materials",
    description: "Training catalog with delivery mode and lifecycle status.",
    resource: "training",
    columns: [
      { key: "title", label: "Title" },
      { key: "audience", label: "Audience" },
      { key: "delivery_mode", label: "Mode" },
      { key: "status", label: "Status" }
    ],
    fields: ["title", "audience", "delivery_mode", "status"]
  },
  documents: {
    title: "HR Documents",
    description: "Policy and onboarding document registry for HR operations.",
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
