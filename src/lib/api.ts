// Shared HTTP client for the SIKAS MUHIWA backend (server/). All resource-specific API calls
// (students now, transactions/fee-categories in later migration stages) go through the `api`
// object below so the base URL, response envelope, and error handling only live in one place.

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000'

interface ApiSuccessEnvelope<T> {
  success: true
  data: T
}

interface ApiErrorEnvelope {
  success: false
  error: { message: string }
}

/** Thrown for both network failures (status 0) and backend error responses. */
export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${BASE_URL}/api${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...options.headers },
    })
  } catch {
    throw new ApiError(0, 'Tidak dapat terhubung ke server. Pastikan backend sedang berjalan.')
  }

  let body: ApiSuccessEnvelope<T> | ApiErrorEnvelope | null = null
  try {
    body = await response.json()
  } catch {
    // No JSON body (e.g. a 204 or an unexpected non-JSON response) — handled below.
  }

  if (!response.ok || !body?.success) {
    const message = body && !body.success ? body.error.message : `Permintaan gagal (${response.status})`
    throw new ApiError(response.status, message)
  }

  return body.data
}

export const api = {
  get: <T>(path: string): Promise<T> => request<T>(path),
  post: <T>(path: string, data?: unknown): Promise<T> =>
    request<T>(path, { method: 'POST', body: data !== undefined ? JSON.stringify(data) : undefined }),
  put: <T>(path: string, data?: unknown): Promise<T> =>
    request<T>(path, { method: 'PUT', body: data !== undefined ? JSON.stringify(data) : undefined }),
  delete: <T>(path: string): Promise<T> => request<T>(path, { method: 'DELETE' }),
}
