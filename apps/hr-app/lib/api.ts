"use client";

import { platformLinks } from "@vlworkhub/config";

type TaskListResponse = {
  items?: Array<Record<string, string | number | null>>;
};

async function request(path: string, init?: RequestInit) {
  const res = await fetch(`${platformLinks.api}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {})
    }
  });

  if (!res.ok) {
    throw new Error(`Failed request: ${path}`);
  }

  return res.json();
}

export const api = {
  async getTasks() {
    const data = await request("/resources/tasks");
    return data as TaskListResponse;
  },

  async startTask(taskId: number) {
    const data = await request(`/resources/tasks/${taskId}/start`, {
      method: "POST"
    });
    return data;
  },

  async completeTask(taskId: number) {
    const data = await request(`/resources/tasks/${taskId}/complete`, {
      method: "POST"
    });
    return data;
  }
};
