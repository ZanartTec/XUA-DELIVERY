/**
 * Fetch wrapper para chamadas client-side.
 * Usa credentials: "include" para enviar cookie httpOnly automaticamente.
 */

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(url, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(
      res.status,
      body.error || `Erro ${res.status}`,
      body.details
    );
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  get<T>(url: string) {
    return request<T>(url);
  },

  post<T>(url: string, data?: unknown) {
    return request<T>(url, {
      method: "POST",
      body: data ? JSON.stringify(data) : undefined,
    });
  },

  patch<T>(url: string, data?: unknown) {
    return request<T>(url, {
      method: "PATCH",
      body: data ? JSON.stringify(data) : undefined,
    });
  },

  delete<T>(url: string) {
    return request<T>(url, { method: "DELETE" });
  },
};
