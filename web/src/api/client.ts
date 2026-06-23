export const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

// In-memory token — set by AuthContext, never persisted to localStorage
let _token: string | null = null
let _onUnauthenticated: (() => void) | null = null

export const tokenStore = {
  set: (token: string | null) => { _token = token },
  onUnauthenticated: (cb: () => void) => { _onUnauthenticated = cb },
}

type RequestOptions = Omit<RequestInit, 'body'> & { body?: unknown }

async function request<T>(path: string, { body, ...options }: RequestOptions = {}, isRetry = false): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(_token && { Authorization: `Bearer ${_token}` }),
      ...options.headers,
    },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  })

  if (res.status === 401 && !isRetry) {
    const errorData = await res.json().catch(() => null)
    const refreshed = await silentRefresh()
    if (refreshed) return request<T>(path, { body, ...options }, true)
    _onUnauthenticated?.()
    throw new Error(errorData?.error ?? 'Session expired.')
  }

  if (!res.ok) {
    const data = await res.json().catch(() => null)
    throw new Error(data?.error ?? res.statusText)
  }

  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

async function silentRefresh(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/api/v1/session`, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    })
    if (!res.ok) return false
    const data = await res.json()
    _token = data.token
    return true
  } catch {
    return false
  }
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) => request<T>(path, options),
  post: <T>(path: string, body: unknown) => request<T>(path, { method: 'POST', body }),
  patch: <T>(path: string, body: unknown) => request<T>(path, { method: 'PATCH', body }),
  put: <T>(path: string, body: unknown) => request<T>(path, { method: 'PUT', body }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
}
