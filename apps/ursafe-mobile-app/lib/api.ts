import Constants from "expo-constants";

class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const DEFAULT_API_URL = "https://api.vlworkhub.ca";

function getApiUrlFromExpoHost() {
  const hostUri =
    (Constants.expoConfig as { hostUri?: string } | undefined)?.hostUri ||
    (Constants as { manifest2?: { extra?: { expoClient?: { hostUri?: string } } } }).manifest2?.extra?.expoClient?.hostUri;

  if (!hostUri) return undefined;
  const host = hostUri.split(":")[0];
  return host ? `http://${host}:8080` : undefined;
}

export const API_URL =
  process.env.EXPO_PUBLIC_API_URL ||
  (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl ||
  getApiUrlFromExpoHost() ||
  DEFAULT_API_URL;

export async function apiRequest<T>(path: string, init?: RequestInit, token?: string): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers || {})
    }
  });

  if (!response.ok) {
    const message = await response.text().catch(() => "Request failed");
    throw new ApiError(response.status, message || `Request failed: ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export async function apiRequestWithFallback<T>(
  preferredPath: string,
  fallbackPath: string,
  init?: RequestInit,
  token?: string
): Promise<T> {
  try {
    return await apiRequest<T>(preferredPath, init, token);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return apiRequest<T>(fallbackPath, init, token);
    }
    throw error;
  }
}
