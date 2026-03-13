import { HrPortalHeader } from "../../components/hr-portal-header";
import { HrAdminPanel } from "../../components/hr-admin-panel";

export default function AdminPage() {
  return (
    <div>
      <HrPortalHeader
        title="HR Administration"
        description="Assign HR roles and departments to globally managed VLWorkHub users."
        breadcrumb="Admin"
      />
      <HrAdminPanel />
    </div>
  );
}
