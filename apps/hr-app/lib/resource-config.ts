import type { NavItem, ResourceConfig } from "@vlworkhub/types";
import { platformLinks } from "@vlworkhub/config";

export const hrNav: NavItem[] = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Announcements", href: "/announcements" },
  { label: "Tasks", href: "/tasks" },
  { label: "Training", href: "/training" },
  { label: "Surveys", href: "/surveys" },
  { label: "Documents", href: "/documents" },
  { label: "Admin", href: "/admin" }
];

export const hrMeta = {
  appName: "HR System",
  rootHref: `${platformLinks.root}/dashboard`
};

export const hrResources: Record<string, ResourceConfig> = {
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
    description: "Training catalog with embedded video and quiz links.",
    resource: "training",
    columns: [
      { key: "training_name", label: "Training Name" },
      { key: "video_iframe_link", label: "Video Iframe" },
      { key: "quiz_iframe_link", label: "Quiz Iframe" },
      { key: "status", label: "Status" }
    ],
    fields: ["training_name", "video_iframe_link", "quiz_iframe_link", "status"]
  },
  surveys: {
    title: "Surveys",
    description: "Survey templates and completion assignments linked to training.",
    resource: "surveys",
    columns: [
      { key: "title", label: "Title" },
      { key: "url", label: "URL" },
      { key: "due_date", label: "Due Date" },
      { key: "status", label: "Status" }
    ],
    fields: ["title", "url", "due_date", "status"]
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
