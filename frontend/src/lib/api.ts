export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export type User = { id: number; username: string; displayName: string; isAdmin: boolean; isActive: boolean };

export async function api<T>(path: string, body?: unknown, signal?: AbortSignal, method?: "DELETE"): Promise<T> {
  const response = await fetch(path, {
    method: method ?? (body === undefined ? "GET" : "POST"),
    credentials: "same-origin",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });
  // Proxies and gateways can return non-JSON errors; the status must still reach callers.
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(response.status, typeof payload?.detail === "string" ? payload.detail : "The request could not be completed.");
  }
  return payload as T;
}
