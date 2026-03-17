export type VisibleTaskAssignment = {
  assigned_user_name?: string | null;
  assigned_department_name?: string | null;
  assignment_type?: string | null;
  assigned_user_manager?: string | null;
};

export type VisibleTaskUser = {
  name: string;
  department: string | null;
  role: "ADMIN" | "MANAGER" | "EMPLOYEE";
};

export type VisibleTask<T = Record<string, unknown>> = T & {
  assignments?: VisibleTaskAssignment[];
};

export function getVisibleTasks<T extends Record<string, unknown>>(tasks: Array<VisibleTask<T>>, currentUser: VisibleTaskUser | null) {
  if (!currentUser) {
    return [] as Array<VisibleTask<T>>;
  }

  return tasks.filter((task) => {
    if (!task.assignments || task.assignments.length === 0) {
      return false;
    }

    return task.assignments.some((assignment) => {
      const assignmentType = String(assignment.assignment_type ?? "").toUpperCase();
      const departmentMatch = Boolean(assignment.assigned_department_name) &&
        Boolean(currentUser.department) &&
        assignment.assigned_department_name === currentUser.department;
      return (
        assignment.assigned_user_name === currentUser.name ||
        departmentMatch ||
        assignmentType === "ALL_STAFF" ||
        (currentUser.role === "MANAGER" && assignment.assigned_user_manager === currentUser.name) ||
        currentUser.role === "ADMIN"
      );
    });
  });
}

