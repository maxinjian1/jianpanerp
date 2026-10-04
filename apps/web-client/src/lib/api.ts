// api-core への fetch ラッパー (next.config.js の rewrites で /api → localhost:4000)

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set('Content-Type', 'application/json')
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('accessToken')
    const tenantId = localStorage.getItem('tenantId')
    if (token) headers.set('Authorization', `Bearer ${token}`)
    if (tenantId) headers.set('x-tenant-id', tenantId)
  }

  const response = await fetch(`/api/v1${path}`, { ...init, headers })
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    const message = Array.isArray(body?.message) ? body.message.join(', ') : body?.message
    throw new ApiError(response.status, message || response.statusText)
  }
  return response.json()
}
