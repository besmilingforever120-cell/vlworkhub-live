"use client";

import { useEffect, useState } from "react";
import { getApiErrorMessage, getMyHrRole, type HrRoleSummary } from "./hr-client";

const defaultRole: HrRoleSummary = {
  userId: "",
  role: "employee",
  managerId: null
};

export function useHrRole() {
  const [data, setData] = useState<HrRoleSummary>(defaultRole);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function refresh() {
    try {
      setLoading(true);
      setError("");
      const result = await getMyHrRole(true);
      setData(result);
    } catch (loadError) {
      setData(defaultRole);
      setError(getApiErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  return {
    ...data,
    loading,
    error,
    refresh
  };
}
