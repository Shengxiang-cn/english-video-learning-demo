export class ApiError extends Error {
  status: number
  code?: string
  retryAfterSec?: number

  constructor(message: string, status: number, code?: string, retryAfterSec?: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.retryAfterSec = retryAfterSec
  }
}

type RequestJsonOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  accessToken?: string
  signal?: AbortSignal
}

export async function requestJson<T>(path: string, options: RequestJsonOptions = {}) {
  const response = await fetch(path, {
    method: options.method ?? (options.body === undefined ? 'GET' : 'POST'),
    headers: {
      ...(options.accessToken ? { Authorization: `Bearer ${options.accessToken}` } : {}),
      ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: options.signal,
  })
  const data = await response.json().catch(() => ({})) as {
    error?: unknown
    code?: unknown
    retryAfterSec?: unknown
  }

  if (!response.ok) {
    throw new ApiError(
      typeof data.error === 'string' ? data.error : `${path} failed.`,
      response.status,
      typeof data.code === 'string' ? data.code : undefined,
      typeof data.retryAfterSec === 'number' ? data.retryAfterSec : undefined,
    )
  }

  return data as T
}
