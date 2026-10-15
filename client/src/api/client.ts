export class ApiError extends Error {
  status: number;
  code?: string;
  details?: unknown;

  constructor(status: number, message: string, code?: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

let csrfToken: string | null = null;

export function setCsrfToken(token: string | null) {
  csrfToken = token;
}

export function getCsrfToken() {
  return csrfToken;
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const method = (init.method || 'GET').toUpperCase();
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (!['GET', 'HEAD'].includes(method) && csrfToken) headers.set('X-CSRF-Token', csrfToken);
  const response = await fetch(path, { ...init, headers, credentials: 'include' });
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  let data: { error?: { message?: string; code?: string; details?: unknown } } | null = null;
  if (text) {
    try {
      data = JSON.parse(text) as { error?: { message?: string; code?: string; details?: unknown } };
    } catch {
      throw new ApiError(response.status, 'The CRM API did not answer. The page is published, but sign-in has no server on this site.');
    }
  }
  if (!response.ok) {
    throw new ApiError(response.status, data?.error?.message || 'The request could not be completed.', data?.error?.code, data?.error?.details);
  }
  return data as T;
}

export function download(path: string) {
  window.location.href = path;
}
