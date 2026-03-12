import { env } from "../config/env";

type StoreItem = Record<string, string | number | null> & { id: number; organization_id: number };

type StoreKey =
  | "employees"
  | "announcements"
  | "tasks"
  | "training"
  | "training_assignments"
  | "training_completions"
  | "surveys"
  | "survey_assignments"
  | "survey_completions"
  | "documents"
  | "document_signatures";

const devStore: Record<StoreKey, StoreItem[]> = {
  employees: [
    { id: 1, organization_id: 1, full_name: "Alex Morgan", department: "People & Culture", job_title: "HR Manager", email: "alex@vlworkhub.ca" },
    { id: 2, organization_id: 1, full_name: "Sam Rivera", department: "Operations", job_title: "Program Coordinator", email: "sam@vlworkhub.ca" }
  ],
  announcements: [
    { id: 1, organization_id: 1, title: "Benefits Enrollment Window", body: "Open enrollment closes Friday.", audience: "All Staff", publish_date: "2026-03-12", start_date: "2026-03-12", end_date: "2026-03-21", priority: "Important", status: "Published" },
    { id: 2, organization_id: 1, title: "Policy Refresh", body: "Review the updated travel and expense policy.", audience: "Managers", publish_date: "2026-03-10", start_date: "2026-03-10", end_date: "2026-03-31", priority: "Normal", status: "Published" }
  ],
  tasks: [
    { id: 1, organization_id: 1, title: "Approve onboarding documents", assigned_to: "Alex Morgan", due_date: "2026-03-15", status: "In Progress", priority: "High", description: "Validate all onboarding package uploads and approvals." },
    { id: 2, organization_id: 1, title: "Complete incident response refresher", assigned_to: "Sam Rivera", due_date: "2026-03-18", status: "Not Started", priority: "Normal", description: "Complete the annual HR incident response refresher." }
  ],
  training: [
    { id: 1, organization_id: 1, title: "Respectful Workplace", audience: "All Staff", delivery_mode: "Video", content_url: "https://example.com/training/workplace", status: "Active" },
    { id: 2, organization_id: 1, title: "Manager Escalation Workflow", audience: "Managers", delivery_mode: "Workshop", content_url: "https://example.com/training/escalation", status: "Draft" }
  ],
  training_assignments: [
    { id: 1, organization_id: 1, title: "Respectful Workplace - March cohort", training_id: 1, assignee_name: "Sam Rivera", due_date: "2026-03-20", survey_url: "https://example.com/survey/1", status: "Assigned" }
  ],
  training_completions: [
    { id: 1, organization_id: 1, assignment_id: 1, user_name: "Sam Rivera", progress_percent: 60, completed_on: null, last_position_seconds: 420 }
  ],
  surveys: [
    { id: 1, organization_id: 1, title: "Training Feedback Survey", url: "https://example.com/forms/training-feedback", due_date: "2026-03-22", status: "Active" }
  ],
  survey_assignments: [
    { id: 1, organization_id: 1, title: "Feedback survey for March cohort", survey_id: 1, assignee_name: "Sam Rivera", due_date: "2026-03-22", status: "Assigned" }
  ],
  survey_completions: [],
  documents: [
    { id: 1, organization_id: 1, title: "Offer Letter - Sam Rivera", category: "Onboarding", owner_name: "Alex Morgan", storage_path: "/documents/offer-letter-sam.pdf", due_date: "2026-03-16", requires_signature: "Yes", status: "Pending Signature" },
    { id: 2, organization_id: 1, title: "Employee Handbook", category: "Policy", owner_name: "HR Team", storage_path: "/documents/employee-handbook.pdf", due_date: "2026-03-30", requires_signature: "No", status: "Published" }
  ],
  document_signatures: [
    { id: 1, organization_id: 1, document_id: 1, signer_name: "Sam Rivera", status: "Pending", signed_at: null, note: "Awaiting onboarding signature" }
  ]
};

const idCounters = Object.fromEntries(
  Object.entries(devStore).map(([key, items]) => [key, Math.max(0, ...items.map((item) => item.id))])
) as Record<StoreKey, number>;

export function shouldUseDevStore() {
  return env.nodeEnv !== "production";
}

export function listDevResource(resource: StoreKey, organizationId: number) {
  return devStore[resource].filter((item) => item.organization_id === organizationId);
}

export function createDevResource(resource: StoreKey, organizationId: number, values: Record<string, string | null>) {
  const id = ++idCounters[resource];
  const item: StoreItem = { id, organization_id: organizationId, ...values };
  devStore[resource].unshift(item);
  return item;
}

export function updateDevResource(resource: StoreKey, organizationId: number, id: number, values: Record<string, string | null>) {
  const index = devStore[resource].findIndex((item) => item.id === id && item.organization_id === organizationId);
  if (index === -1) return null;
  devStore[resource][index] = { ...devStore[resource][index], ...values };
  return devStore[resource][index];
}

export function deleteDevResource(resource: StoreKey, organizationId: number, id: number) {
  const before = devStore[resource].length;
  devStore[resource] = devStore[resource].filter((item) => !(item.id === id && item.organization_id === organizationId));
  return before !== devStore[resource].length;
}
