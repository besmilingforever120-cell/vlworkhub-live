import { EmployeesDirectory } from "../../components/employees-directory";
import { HrPortalHeader } from "../../components/hr-portal-header";

export default function EmployeesPage() {
  return (
    <div>
      <HrPortalHeader
        title="Employees"
        description="Browse employees within your allowed HR scope and open their profile audit view."
        breadcrumb="Employees"
      />
      <EmployeesDirectory />
    </div>
  );
}
