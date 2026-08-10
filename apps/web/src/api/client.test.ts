import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiBinaryRequest, apiRequest, configureApiRuntime, resetApiClientForTests } from './client'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('api client', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    resetApiClientForTests()
  })

  it('unwraps the standard success response and includes credentials', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ success: true, data: { value: 7 }, meta: {} }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(apiRequest<{ value: number }>('/test')).resolves.toEqual({ value: 7 })
    expect(fetchMock).toHaveBeenCalledWith('/api/test', expect.objectContaining({ credentials: 'include' }))
  })

  it('maps a standard error response without exposing unsafe internals', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      success: false,
      error: { code: 'DATABASE_001', message: 'sensitive database detail', details: [] },
    }, 500)))

    await expect(apiRequest('/test')).rejects.toMatchObject({
      code: 'DATABASE_001',
      message: 'ไม่สามารถดำเนินการได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง',
    })
  })

  it('attaches the access token and X-Branch-ID from memory runtime', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ success: true, data: {}, meta: {} }))
    vi.stubGlobal('fetch', fetchMock)
    configureApiRuntime({
      getAccessToken: () => 'token-1',
      getBranchId: () => 'branch-1',
      refreshAccessToken: async () => 'token-2',
      onSessionExpired: vi.fn(),
      onForbidden: vi.fn(),
    })

    await apiRequest('/test')
    const headers = new Headers(fetchMock.mock.calls[0]?.[1]?.headers)
    expect(headers.get('Authorization')).toBe('Bearer token-1')
    expect(headers.get('X-Branch-ID')).toBe('branch-1')
    expect(headers.get('X-Request-ID')).toBeTruthy()
  })

  it('refreshes once and retries the original request once after a 401', async () => {
    let token = 'expired-token'
    const refresh = vi.fn(async () => {
      token = 'fresh-token'
      return token
    })
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ success: false, error: { code: 'AUTH_003', message: 'expired', details: [] } }, 401))
      .mockResolvedValueOnce(jsonResponse({ success: true, data: { ok: true }, meta: {} }))
    vi.stubGlobal('fetch', fetchMock)
    configureApiRuntime({
      getAccessToken: () => token,
      getBranchId: () => null,
      refreshAccessToken: refresh,
      onSessionExpired: vi.fn(),
      onForbidden: vi.fn(),
    })

    await expect(apiRequest('/protected')).resolves.toEqual({ ok: true })
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const retryHeaders = new Headers(fetchMock.mock.calls[1]?.[1]?.headers)
    expect(retryHeaders.get('Authorization')).toBe('Bearer fresh-token')
  })

  it('does not refresh again when the retried request also returns 401', async () => {
    const refresh = vi.fn(async () => 'fresh-token')
    const onSessionExpired = vi.fn()
    const unauthorized = jsonResponse({
      success: false,
      error: { code: 'AUTH_003', message: 'expired', details: [] },
    }, 401)
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(unauthorized)
      .mockResolvedValueOnce(jsonResponse({
        success: false,
        error: { code: 'AUTH_003', message: 'expired', details: [] },
      }, 401))
    vi.stubGlobal('fetch', fetchMock)
    configureApiRuntime({
      getAccessToken: () => 'expired-token',
      getBranchId: () => null,
      refreshAccessToken: refresh,
      onSessionExpired,
      onForbidden: vi.fn(),
    })

    await expect(apiRequest('/protected')).rejects.toMatchObject({ status: 401 })
    expect(refresh).toHaveBeenCalledOnce()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(onSessionExpired).toHaveBeenCalledOnce()
  })

  it('returns authenticated binary responses for report exports', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('report-data', {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="sales.csv"',
      },
    }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await apiBinaryRequest('/reports/sales/export', { method: 'POST' })

    expect(result.blob.size).toBe(11)
    expect(result.blob.type).toBe('text/csv')
    expect(result.contentDisposition).toContain('sales.csv')
    expect(fetchMock).toHaveBeenCalledWith('/api/reports/sales/export', expect.objectContaining({ credentials: 'include' }))
  })

  it('can keep a forbidden widget response local to the widget', async () => {
    const onForbidden = vi.fn()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      success: false,
      error: { code: 'PERMISSION_001', message: 'forbidden', details: [] },
    }, 403)))
    configureApiRuntime({
      getAccessToken: () => 'token',
      getBranchId: () => 'branch-1',
      refreshAccessToken: async () => 'token',
      onSessionExpired: vi.fn(),
      onForbidden,
    })

    await expect(apiRequest('/widget', { notifyForbidden: false })).rejects.toMatchObject({ status: 403 })
    expect(onForbidden).not.toHaveBeenCalled()
  })
})
