import type { NavItem, ResourceConfig } from "@vlworkhub/types";
import { platformLinks } from "@vlworkhub/config";

export const ursafeNav: NavItem[] = [
  { label: "Mileage", href: "/mileage" },
  { label: "Incidents", href: "/incidents" },
  { label: "Checklists", href: "/checklists" },
  { label: "Emergency Contacts", href: "/emergency-contacts" }
];

export const ursafeMeta = {
  appName: "UR Safe",
  rootHref: `${platformLinks.root}/dashboard`
};

export const ursafeResources: Record<string, ResourceConfig> = {
  mileage: {
    title: "Mileage Tracking",
    description: "Mobile-friendly trip and vehicle mileage submissions.",
    resource: "mileage",
    columns: [
      { key: "trip_date", label: "Trip Date" },
      { key: "employee_name", label: "Employee" },
      { key: "vehicle_id", label: "Vehicle" },
      { key: "distance_km", label: "KM" }
    ],
    fields: ["trip_date", "employee_name", "vehicle_id", "distance_km"]
  },
  incidents: {
    title: "Safety Incidents",
    description: "Field incident reporting with severity and ownership status.",
    resource: "incidents",
    columns: [
      { key: "title", label: "Title" },
      { key: "severity", label: "Severity" },
      { key: "reported_by", label: "Reported By" },
      { key: "status", label: "Status" }
    ],
    fields: ["title", "severity", "reported_by", "status"]
  },
  checklists: {
    title: "Safety Checklists",
    description: "Operational safety checklist completion and compliance tracking.",
    resource: "safety_checklists",
    columns: [
      { key: "title", label: "Checklist" },
      { key: "location", label: "Location" },
      { key: "completed_by", label: "Completed By" },
      { key: "status", label: "Status" }
    ],
    fields: ["title", "location", "completed_by", "status"]
  },
  emergencyContacts: {
    title: "Emergency Contacts",
    description: "Emergency contact management for staff in the field.",
    resource: "emergency_contacts",
    columns: [
      { key: "full_name", label: "Contact" },
      { key: "relation", label: "Relation" },
      { key: "phone", label: "Phone" },
      { key: "employee_name", label: "Employee" }
    ],
    fields: ["full_name", "relation", "phone", "employee_name"]
  }
};
