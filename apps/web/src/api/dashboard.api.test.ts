import { afterEach, describe, expect, it, vi } from 'vitest'
import { configureApiRuntime, resetApiClientForTests } from './client'
import { dashboardApi } from './dashboard.api'
import type { DashboardFilters } from '../features/dashboard/dashboard.types'

const filters: DashboardFilters = {
  dateFrom: '2026-08-01', dateTo: '2026-08-10', timezone: 'Asia/Bangkok', granularity: 'daily',
  branchId: '30000000-0000-4000-8000-000000000001',
}

describe('dashboard api', () => {
  afterEach(() => { vi.unstubAllGlobals(); resetApiClientForTests() })

  it('unwraps dashboard data and sends scoped filters with the branch header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true, data: { totalBookings: 4 }, meta: {} }), { headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)
    configureApiRuntime({ getAccessToken: () => 'token', getBranchId: () => filters.branchId, refreshAccessToken: async () => 'token', onSessionExpired: vi.fn(), onForbidden: vi.fn() })

    await expect(dashboardApi.overview(filters)).resolves.toMatchObject({ totalBookings: 4 })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('dateFrom=2026-08-01')
    expect(url).toContain('dateTo=2026-08-10')
    expect(url).toContain(`branchId=${filters.branchId}`)
    expect(new Headers(init.headers).get('X-Branch-ID')).toBe(filters.branchId)
  })

  it('omits the branch header for an all-accessible-branches query', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true, data: [], meta: {} }), { headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)
    configureApiRuntime({ getAccessToken: () => 'token', getBranchId: () => filters.branchId, refreshAccessToken: async () => 'token', onSessionExpired: vi.fn(), onForbidden: vi.fn() })
    await dashboardApi.trends({ ...filters, branchId: null })
    const headers = new Headers(fetchMock.mock.calls[0]?.[1]?.headers)
    expect(headers.has('X-Branch-ID')).toBe(false)
  })
})
