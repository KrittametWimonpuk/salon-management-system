import { env } from '../config/env'
import { ApiError, type ApiErrorDetail } from './errors'

interface SuccessEnvelope<T> {
  success: true
  data: T
  meta: Record<string, unknown>
}

interface ErrorEnvelope {
  success: false
  error: {
    code: string
    message: string
    details: ApiErrorDetail[]
  }
}

export interface ApiRuntime {
  getAccessToken: () => string | null
  getBranchId: () => string | null
  refreshAccessToken: () => Promise<string>
  onSessionExpired: () => void
  onForbidden: () => void
}

export interface ApiRequestOptions extends Omit<RequestInit, 'headers'> {
  headers?: Record<string, string>
  auth?: boolean
  branch?: boolean
  retryOnUnauthorized?: boolean
}

const emptyRuntime: ApiRuntime = {
  getAccessToken: () => null,
  getBranchId: () => null,
  refreshAccessToken: async () => { throw new Error('Refresh handler is not configured') },
  onSessionExpired: () => undefined,
  onForbidden: () => undefined,
}

let runtime = emptyRuntime
let refreshPromise: Promise<string> | null = null

export function configureApiRuntime(next: ApiRuntime): () => void {
  runtime = next
  return () => {
    if (runtime === next) runtime = emptyRuntime
  }
}

function requestId(): string {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

async function parseEnvelope<T>(response: Response): Promise<SuccessEnvelope<T> | ErrorEnvelope | null> {
  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) return null
  try {
    return await response.json() as SuccessEnvelope<T> | ErrorEnvelope
  } catch {
    return null
  }
}

async function execute<T>(path: string, options: ApiRequestOptions, retried: boolean): Promise<T> {
  const {
    auth = true,
    branch = true,
    retryOnUnauthorized = true,
    headers: requestedHeaders,
    ...requestInit
  } = options
  const headers = new Headers(requestedHeaders)
  headers.set('Accept', 'application/json')
  headers.set('X-Request-ID', requestId())
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')

  if (auth) {
    const token = runtime.getAccessToken()
    if (token) headers.set('Authorization', `Bearer ${token}`)
  }
  if (branch) {
    const branchId = runtime.getBranchId()
    if (branchId) headers.set('X-Branch-ID', branchId)
  }

  let response: Response
  try {
    response = await fetch(`${env.apiBaseUrl}${path}`, {
      ...requestInit,
      headers,
      credentials: 'include',
    })
  } catch {
    throw new ApiError({ code: 'NETWORK_ERROR', message: '', status: 0 })
  }

  if (
    response.status === 401
    && auth
    && retryOnUnauthorized
    && !retried
  ) {
    try {
      refreshPromise ??= runtime.refreshAccessToken().finally(() => { refreshPromise = null })
      await refreshPromise
      return execute<T>(path, options, true)
    } catch (error) {
      runtime.onSessionExpired()
      throw error
    }
  }

  if (response.status === 401 && auth && retried) {
    runtime.onSessionExpired()
  }

  const envelope = await parseEnvelope<T>(response)
  if (!response.ok || !envelope || !envelope.success) {
    if (response.status === 403) runtime.onForbidden()
    const payload = envelope && !envelope.success ? envelope.error : null
    throw new ApiError({
      code: payload?.code ?? `HTTP_${response.status || 500}`,
      message: payload?.message ?? '',
      status: response.status,
      details: payload?.details ?? [],
    })
  }
  return envelope.data
}

export function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  return execute<T>(path, options, false)
}

export function resetApiClientForTests(): void {
  runtime = emptyRuntime
  refreshPromise = null
}
