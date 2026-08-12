import { afterEach, describe, expect, it, vi } from 'vitest'
import { reportsApi, safeFilename } from './reports.api'
import { resetApiClientForTests } from './client'
import type { ReportRequest } from '../features/reports/reports.types'

const request: ReportRequest = {
  dateFrom: '2026-08-01', dateTo: '2026-08-10', timezone: 'Asia/Bangkok', granularity: 'daily',
  branchId: null, page: 1, pageSize: 20, sort: 'date', order: 'desc',
}

describe('reports api', () => {
  afterEach(() => { vi.unstubAllGlobals(); resetApiClientForTests() })

  it('generates report previews through the standard envelope', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true, data: { reportType: 'sales', rows: [], totalItems: 0 }, meta: {} }), { headers: { 'Content-Type': 'application/json' } })))
    await expect(reportsApi.generate('sales', request)).resolves.toMatchObject({ reportType: 'sales', rows: [] })
  })

  it('exports a blob and uses a sanitized content-disposition filename', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('csv-data', { headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="sales-report.csv"' } }))
    vi.stubGlobal('fetch', fetchMock)
    const artifact = await reportsApi.export('sales', 'csv', request)
    expect(artifact.filename).toBe('sales-report.csv')
    expect(artifact.blob.size).toBe(8)
    expect(artifact.contentType).toBe('text/csv')
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({ format: 'csv', dateFrom: '2026-08-01' })
  })

  it('rejects path traversal characters in exported filenames', () => {
    expect(safeFilename('attachment; filename="../../secret.csv"', 'fallback.csv')).toBe('-.-secret.csv')
  })
})
