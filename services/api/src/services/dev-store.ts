import { env } from "../config/env";

type StoreValue = string | number | boolean | null;
type StoreItem = Record<string, StoreValue> & { id: number; organization_id: string };

type StoreKey =
  | "employees"
  | "announcements"
  | "tasks"
  | "task_user_states"
  | "training"
  | "training_assignments"
  | "training_completions"
  | "surveys"
  | "survey_assignments"
  | "survey_completions"
  | "documents"
  | "document_signatures"
  | "emergency_contacts"
  | "safety_checklists"
  | "ursafe_user_profiles"
  | "ursafe_trips"
  | "ursafe_shifts"
  | "ursafe_check_ins"
  | "ursafe_emergencies"
  | "ursafe_active_sessions";

const DEV_ORG_ID = "11111111-1111-1111-1111-111111111111";
const URSAFE_MANAGER_ID = "33333333-3333-3333-3333-333333333333";
const URSAFE_EMPLOYEE_ID = "44444444-4444-4444-4444-444444444444";

let devStore: Record<StoreKey, StoreItem[]> = {
  employees: [
    { id: 1, organization_id: DEV_ORG_ID, full_name: "Alex Morgan", department: "People & Culture", job_title: "HR Manager", email: "alex@vlworkhub.ca" },
    { id: 2, organization_id: DEV_ORG_ID, full_name: "Sam Rivera", department: "Operations", job_title: "Program Coordinator", email: "sam@vlworkhub.ca" }
  ],
  announcements: [
    { id: 1, organization_id: DEV_ORG_ID, title: "Benefits Enrollment Window", body: "Open enrollment closes Friday.", audience: "All Staff", publish_date: "2026-03-12", start_date: "2026-03-12", end_date: "2026-03-21", priority: "Important", status: "Published" },
    { id: 2, organization_id: DEV_ORG_ID, title: "Policy Refresh", body: "Review the updated travel and expense policy.", audience: "Managers", publish_date: "2026-03-10", start_date: "2026-03-10", end_date: "2026-03-31", priority: "Normal", status: "Published" }
  ],
  tasks: [
    { id: 1, organization_id: DEV_ORG_ID, title: "Approve onboarding documents", assigned_to: "Alex Morgan", due_date: "2026-03-15", status: "In Progress", priority: "High", description: "Validate all onboarding package uploads and approvals." },
    { id: 2, organization_id: DEV_ORG_ID, title: "Complete incident response refresher", assigned_to: "Sam Rivera", due_date: "2026-03-18", status: "Not Started", priority: "Normal", description: "Complete the annual HR incident response refresher." }
  ],
  task_user_states: [
    { id: 1, organization_id: DEV_ORG_ID, task_id: 1, user_name: "Alex Morgan", status: "In Progress", completed_on: null }
  ],
  training: [
    { id: 1, organization_id: DEV_ORG_ID, title: "Respectful Workplace", audience: "All Staff", delivery_mode: "Video", content_url: "https://example.com/training/workplace", status: "Active" },
    { id: 2, organization_id: DEV_ORG_ID, title: "Manager Escalation Workflow", audience: "Managers", delivery_mode: "Workshop", content_url: "https://example.com/training/escalation", status: "Draft" }
  ],
  training_assignments: [
    { id: 1, organization_id: DEV_ORG_ID, title: "Respectful Workplace - March cohort", training_id: 1, assignee_name: "Sam Rivera", due_date: "2026-03-20", survey_url: "https://example.com/survey/1", status: "Assigned" }
  ],
  training_completions: [
    { id: 1, organization_id: DEV_ORG_ID, assignment_id: 1, user_name: "Sam Rivera", progress_percent: 60, completed_on: null, last_position_seconds: 420 }
  ],
  surveys: [
    { id: 1, organization_id: DEV_ORG_ID, title: "Training Feedback Survey", url: "https://example.com/forms/training-feedback", due_date: "2026-03-22", status: "Active" }
  ],
  survey_assignments: [
    { id: 1, organization_id: DEV_ORG_ID, title: "Feedback survey for March cohort", survey_id: 1, assignee_name: "Sam Rivera", due_date: "2026-03-22", status: "Assigned" }
  ],
  survey_completions: [],
  documents: [
    { id: 1, organization_id: DEV_ORG_ID, title: "Offer Letter - Sam Rivera", category: "Onboarding", owner_name: "Alex Morgan", storage_path: "/documents/offer-letter-sam.pdf", due_date: "2026-03-16", requires_signature: "Yes", status: "Pending Signature" },
    { id: 2, organization_id: DEV_ORG_ID, title: "Employee Handbook", category: "Policy", owner_name: "HR Team", storage_path: "/documents/employee-handbook.pdf", due_date: "2026-03-30", requires_signature: "No", status: "Published" }
  ],
  document_signatures: [
    { id: 1, organization_id: DEV_ORG_ID, document_id: 1, signer_name: "Sam Rivera", status: "Pending", signed_at: null, note: "Awaiting onboarding signature" }
  ],
  emergency_contacts: [
    { id: 1, organization_id: DEV_ORG_ID, full_name: "Dana Rivera", relation: "Spouse", phone: "604-555-0192", employee_name: "Jordan Lee" },
    { id: 2, organization_id: DEV_ORG_ID, full_name: "Mina Patel", relation: "Parent", phone: "604-555-0111", employee_name: "Jordan Lee" }
  ],
  safety_checklists: [
    { id: 1, organization_id: DEV_ORG_ID, title: "Shift opening checklist", location: "North Vancouver", completed_by: "Jordan Lee", status: "Completed" },
    { id: 2, organization_id: DEV_ORG_ID, title: "Late-night client departure check", location: "Burnaby", completed_by: "Jordan Lee", status: "Action Required" }
  ],
  ursafe_user_profiles: [
    { id: 1, organization_id: DEV_ORG_ID, user_id: URSAFE_MANAGER_ID, department: "Field Operations", manager_user_id: null, is_active: true, must_change_password: false, phone_number: "604-555-0100" },
    { id: 2, organization_id: DEV_ORG_ID, user_id: URSAFE_EMPLOYEE_ID, department: "Community Support", manager_user_id: URSAFE_MANAGER_ID, is_active: true, must_change_password: false, phone_number: "604-555-0101" }
  ],
  ursafe_trips: [
    { id: 1, organization_id: DEV_ORG_ID, user_id: URSAFE_EMPLOYEE_ID, status: "pending_approval", category: "business", start_location: '{"latitude":49.2768,"longitude":-123.1305,"timestamp":"2026-03-12T16:15:00.000Z","address":"Downtown Vancouver"}', end_location: '{"latitude":49.2636,"longitude":-123.1386,"timestamp":"2026-03-12T17:05:00.000Z","address":"Kitsilano"}', start_time: "2026-03-12T16:15:00.000Z", end_time: "2026-03-12T17:05:00.000Z", distance_miles: 7.8, route: '[{"latitude":49.2768,"longitude":-123.1305,"timestamp":"2026-03-12T16:15:00.000Z"},{"latitude":49.2701,"longitude":-123.1345,"timestamp":"2026-03-12T16:38:00.000Z"},{"latitude":49.2636,"longitude":-123.1386,"timestamp":"2026-03-12T17:05:00.000Z"}]', notes: "Client support visit and pharmacy pickup.", vehicle_info: "Toyota RAV4", purpose: "Client support visit" },
    { id: 2, organization_id: DEV_ORG_ID, user_id: URSAFE_MANAGER_ID, status: "approved", category: "business", start_location: '{"latitude":49.2488,"longitude":-123.1086,"timestamp":"2026-03-11T18:00:00.000Z","address":"Mount Pleasant"}', end_location: '{"latitude":49.2827,"longitude":-123.1207,"timestamp":"2026-03-11T18:35:00.000Z","address":"Vancouver Office"}', start_time: "2026-03-11T18:00:00.000Z", end_time: "2026-03-11T18:35:00.000Z", distance_miles: 5.9, route: '[{"latitude":49.2488,"longitude":-123.1086,"timestamp":"2026-03-11T18:00:00.000Z"},{"latitude":49.2667,"longitude":-123.1140,"timestamp":"2026-03-11T18:18:00.000Z"},{"latitude":49.2827,"longitude":-123.1207,"timestamp":"2026-03-11T18:35:00.000Z"}]', notes: "Supervisor follow-up visit.", vehicle_info: "Fleet Van 3", purpose: "Manager site check" }
  ],
  ursafe_shifts: [
    { id: 1, organization_id: DEV_ORG_ID, user_id: URSAFE_EMPLOYEE_ID, start_time: "2026-03-12T18:00:00.000Z", end_time: null, status: "active", last_check_in: "2026-03-12T20:00:00.000Z", check_in_count: 2, start_location: '{"latitude":49.2440,"longitude":-122.9810,"timestamp":"2026-03-12T18:00:00.000Z","address":"New Westminster"}', end_location: null, current_location: '{"latitude":49.2480,"longitude":-122.9870,"timestamp":"2026-03-12T20:05:00.000Z","address":"New Westminster client home"}', client_name: "Individual 14", client_address: "Royal Ave, New Westminster", expected_duration: 180, notes: "Evening check-in support" },
    { id: 2, organization_id: DEV_ORG_ID, user_id: URSAFE_MANAGER_ID, start_time: "2026-03-11T16:00:00.000Z", end_time: "2026-03-11T18:30:00.000Z", status: "completed", last_check_in: "2026-03-11T17:30:00.000Z", check_in_count: 1, start_location: '{"latitude":49.2827,"longitude":-123.1207,"timestamp":"2026-03-11T16:00:00.000Z","address":"Vancouver Office"}', end_location: '{"latitude":49.2488,"longitude":-123.1086,"timestamp":"2026-03-11T18:30:00.000Z","address":"Mount Pleasant"}', current_location: '{"latitude":49.2488,"longitude":-123.1086,"timestamp":"2026-03-11T18:30:00.000Z","address":"Mount Pleasant"}', client_name: "Field audit route", client_address: "Vancouver", expected_duration: 150, notes: "Routine field audit" }
  ],
  ursafe_check_ins: [
    { id: 1, organization_id: DEV_ORG_ID, shift_id: 1, user_id: URSAFE_EMPLOYEE_ID, timestamp: "2026-03-12T19:00:00.000Z", location: '{"latitude":49.2460,"longitude":-122.9840,"timestamp":"2026-03-12T19:00:00.000Z","address":"New Westminster"}', status: "safe", notes: "Initial check-in" },
    { id: 2, organization_id: DEV_ORG_ID, shift_id: 1, user_id: URSAFE_EMPLOYEE_ID, timestamp: "2026-03-12T20:00:00.000Z", location: '{"latitude":49.2480,"longitude":-122.9870,"timestamp":"2026-03-12T20:00:00.000Z","address":"Client home"}', status: "concern", notes: "Client agitation escalating" }
  ],
  ursafe_emergencies: [
    { id: 1, organization_id: DEV_ORG_ID, user_id: URSAFE_EMPLOYEE_ID, shift_id: 1, type: "sos", location: '{"latitude":49.2480,"longitude":-122.9870,"timestamp":"2026-03-12T20:06:00.000Z","address":"Client home"}', timestamp: "2026-03-12T20:06:00.000Z", resolved: false, resolved_by: null, resolved_at: null, notes: "Employee requested immediate supervisor support" }
  ],
  ursafe_active_sessions: [
    { id: 1, organization_id: DEV_ORG_ID, user_id: URSAFE_EMPLOYEE_ID, status: "online", device_name: "iPhone 15", platform: "ios", started_at: "2026-03-12T17:45:00.000Z", last_seen_at: "2026-03-12T20:08:00.000Z", location: '{"latitude":49.2480,"longitude":-122.9870,"timestamp":"2026-03-12T20:08:00.000Z","address":"Client home"}', last_known_activity: "foreground", battery_level: 54, notes: '{"connectionStatus":"online"}' }
  ]
};

const idCounters = Object.fromEntries(
  Object.entries(devStore).map(([key, items]) => [key, Math.max(0, ...items.map((item) => item.id))])
) as Record<StoreKey, number>;

export function shouldUseDevStore() {
  return env.nodeEnv !== "production";
}

export function listDevResource(resource: StoreKey, organizationId: string) {
  return devStore[resource].filter((item) => item.organization_id === organizationId);
}

export function createDevResource(resource: StoreKey, organizationId: string, values: Record<string, StoreValue>) {
  const id = ++idCounters[resource];
  const item: StoreItem = { id, organization_id: organizationId, ...values };
  devStore[resource].unshift(item);
  return item;
}

export function updateDevResource(resource: StoreKey, organizationId: string, id: number, values: Record<string, StoreValue>) {
  const index = devStore[resource].findIndex((item) => item.id === id && item.organization_id === organizationId);
  if (index === -1) return null;
  devStore[resource][index] = { ...devStore[resource][index], ...values };
  return devStore[resource][index];
}

export function deleteDevResource(resource: StoreKey, organizationId: string, id: number) {
  const before = devStore[resource].length;
  devStore[resource] = devStore[resource].filter((item) => !(item.id === id && item.organization_id === organizationId));
  return before !== devStore[resource].length;
}
