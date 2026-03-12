export const resourceMap = {
  clients: { table: "clients", fields: ["full_name", "status", "program", "primary_contact"] },
  staff: { table: "staff", fields: ["full_name", "role", "email", "phone"] },
  notes: { table: "notes", fields: ["client_id", "staff_id", "note_text", "visibility"] },
  incidents: { table: "incidents", fields: ["title", "severity", "reported_by", "status"] },
  documents: {
    table: "documents",
    fields: ["title", "category", "owner_name", "storage_path", "due_date", "requires_signature", "status"]
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
  training: {
    table: "training",
    fields: ["title", "audience", "delivery_mode", "content_url", "status"]
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
  users: { table: "users", fields: ["full_name", "email", "password_hash", "role"] },
  emergency_contacts: { table: "emergency_contacts", fields: ["full_name", "relation", "phone", "employee_name"] },
  safety_checklists: { table: "safety_checklists", fields: ["title", "location", "completed_by", "status"] }
} as const;

export type ResourceKey = keyof typeof resourceMap;
