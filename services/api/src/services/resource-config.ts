export const resourceMap = {
  clients: { table: "clients", fields: ["full_name", "status", "program", "primary_contact"] },
  staff: { table: "staff", fields: ["full_name", "role", "email", "phone", "department", "manager_name", "status"] },
  notes: { table: "notes", fields: ["client_id", "staff_id", "note_text", "visibility"] },
  incidents: { table: "incidents", fields: ["title", "severity", "reported_by", "status"] },
  documents: {
    table: "documents",
    fields: ["title", "category", "owner_name", "storage_path", "due_date", "requires_signature", "status", "file_name", "mime_type", "file_size", "description", "department"]
  },
  employees: { table: "employees", fields: ["full_name", "department", "job_title", "email"] },
  announcements: {
    table: "announcements",
    fields: ["title", "body", "audience", "publish_date", "start_date", "end_date", "priority", "status"]
  },
  tasks: {
    table: "tasks",
    fields: ["title", "assigned_to", "due_date", "status", "priority", "description"]
  },
  task_assignments: {
    table: "task_assignments",
    fields: ["task_id", "assignment_type", "assigned_user_id", "assigned_user_name", "assigned_department_name"]
  },
  task_completion: {
    table: "task_completion",
    fields: ["task_id", "user_id", "user_name", "status", "started_at", "completed_on"]
  },
  task_user_states: {
    table: "task_user_states",
    fields: ["task_id", "user_name", "status", "completed_on"]
  },
  training: {
    table: "training",
    fields: ["training_name", "video_iframe_link", "quiz_iframe_link", "status"]
  },
  training_assignments: {
    table: "training_assignments",
    fields: ["title", "training_id", "assignee_name", "due_date", "survey_url", "status"]
  },
  training_completions: {
    table: "training_completions",
    fields: ["assignment_id", "user_name", "progress_percent", "completed_on", "last_position_seconds"]
  },
  surveys: {
    table: "surveys",
    fields: ["title", "url", "due_date", "status"]
  },
  survey_assignments: {
    table: "survey_assignments",
    fields: ["title", "survey_id", "assignee_name", "due_date", "status"]
  },
  survey_completions: {
    table: "survey_completions",
    fields: ["assignment_id", "user_name", "completed_on"]
  },
  document_signatures: {
    table: "document_signatures",
    fields: ["document_id", "signer_name", "status", "signed_at", "note"]
  },
  mileage: { table: "mileage", fields: ["trip_date", "employee_name", "vehicle_id", "distance_km"] },
  vehicles: { table: "vehicles", fields: ["name", "plate_number", "status", "assigned_location"] },
  users: { table: "users", fields: ["email", "password_hash", "first_name", "last_name", "status", "role", "organization_id"] },
  organizations: { table: "organizations", fields: ["name"] },
  user_roles: { table: "user_roles", fields: ["user_id", "role"] },
  user_app_access: { table: "user_app_access", fields: ["user_id", "app"] },
  hr_user_roles: { table: "hr_user_roles", fields: ["user_id", "role", "department_id"] },
  emergency_contacts: { table: "emergency_contacts", fields: ["full_name", "relation", "phone", "employee_name"] },
  safety_checklists: { table: "safety_checklists", fields: ["title", "location", "completed_by", "status"] }
} as const;

export type ResourceKey = keyof typeof resourceMap;


