export const resourceMap = {
  clients: { table: "clients", fields: ["full_name", "status", "program", "primary_contact"] },
  staff: { table: "staff", fields: ["full_name", "role", "email", "phone"] },
  notes: { table: "notes", fields: ["client_id", "staff_id", "note_text", "visibility"] },
  incidents: { table: "incidents", fields: ["title", "severity", "reported_by", "status"] },
  documents: { table: "documents", fields: ["title", "category", "owner_name", "storage_path"] },
  employees: { table: "employees", fields: ["full_name", "department", "job_title", "email"] },
  announcements: { table: "announcements", fields: ["title", "audience", "publish_date", "status"] },
  tasks: { table: "tasks", fields: ["title", "assigned_to", "due_date", "status"] },
  training: { table: "training", fields: ["title", "audience", "delivery_mode", "status"] },
  mileage: { table: "mileage", fields: ["trip_date", "employee_name", "vehicle_id", "distance_km"] },
  vehicles: { table: "vehicles", fields: ["name", "plate_number", "status", "assigned_location"] },
  users: { table: "users", fields: ["full_name", "email", "password_hash", "role"] },
  emergency_contacts: { table: "emergency_contacts", fields: ["full_name", "relation", "phone", "employee_name"] },
  safety_checklists: { table: "safety_checklists", fields: ["title", "location", "completed_by", "status"] }
} as const;

export type ResourceKey = keyof typeof resourceMap;
