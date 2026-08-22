import { syncRequest } from './invoke';

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  device_id: string;
}

export class SyncApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Prepends http:// if the user didn't type a scheme — reqwest (Rust)
 *  requires an absolute URL, and typing e.g. "localhost:8080" without
 *  one is the natural thing for someone to type in this field. */
export function normalizeServerUrl(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, '');
  return /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
}

async function request<T>(
  baseUrl: string,
  method: string,
  path: string,
  opts?: { token?: string; body?: unknown },
): Promise<T> {
  const res = await syncRequest({
    baseUrl: normalizeServerUrl(baseUrl),
    method,
    path,
    token: opts?.token,
    body: opts?.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  if (res.status < 200 || res.status >= 300) {
    throw new SyncApiError(res.status, res.body || `HTTP ${res.status}`);
  }
  return res.body ? (JSON.parse(res.body) as T) : (undefined as T);
}

export function login(
  baseUrl: string,
  email: string,
  password: string,
  deviceName?: string,
): Promise<TokenResponse> {
  return request<TokenResponse>(baseUrl, 'POST', '/auth/login', {
    body: { email, password, device_name: deviceName },
  });
}

export function refreshToken(baseUrl: string, refreshTokenValue: string): Promise<TokenResponse> {
  return request<TokenResponse>(baseUrl, 'POST', '/auth/refresh', {
    body: { refresh_token: refreshTokenValue },
  });
}
