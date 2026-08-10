import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthTestProvider, BranchTestProvider, authValue } from '../../test/test-utils'
import { ReportDetailPage } from './ReportDetailPage'

const report = {
  reportType: 'sales', timezone: 'Asia/Bangkok', dateFrom: '2026-08-01T00:00:00.000Z', dateTo: '2026-08-11T00:00:00.000Z',
  summary: { netSales: 12500, bookingCount: 1 },
  rows: [{ date: '2026-08-08T03:00:00.000Z', bookingId: 'booking-1', bookingNumber: 'BK-001', branchName: 'Main', customerName: 'Nina', paymentStatus: 'PAID', grossSales: 12500, discountTotal: 0, netSales: 12500, paidAmount: 12500, refundedAmount: 0, outstandingAmount: 0 }],
  page: 1, pageSize: 20, totalItems: 1, totalPages: 1,
}

function renderPage() {
  return render(<MemoryRouter initialEntries={['/admin/reports/sales']}><AuthTestProvider value={authValue({ permissions: ['report.read', 'report.export', 'sales.summary.read'] })}><BranchTestProvider><Routes><Route path="/admin/reports/:reportPath" element={<ReportDetailPage />} /></Routes></BranchTestProvider></AuthTestProvider></MemoryRouter>)
}

describe('ReportDetailPage', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('generates and renders the report table', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true, data: report, meta: {} }), { headers: { 'Content-Type': 'application/json' } })))
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: /สร้างรายงาน/ }))
    expect(await screen.findByText('BK-001')).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'ยอดสุทธิ' })).toBeInTheDocument()
    expect(screen.getByText('Nina')).toBeInTheDocument()
  })

  it('calls the authenticated export endpoint for CSV', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, data: report, meta: {} }), { headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response('csv', { headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="sales.csv"' } }))
    vi.stubGlobal('fetch', fetchMock)
    const createObjectURL = vi.fn(() => 'blob:test')
    const revokeObjectURL = vi.fn()
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: /สร้างรายงาน/ }))
    await screen.findByText('BK-001')
    await userEvent.click(screen.getByRole('button', { name: 'ส่งออก CSV' }))
    expect(await screen.findByText('เตรียมไฟล์ CSV เรียบร้อยแล้ว')).toBeInTheDocument()
    expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/reports/sales/export')
    expect(createObjectURL).toHaveBeenCalledOnce()
    click.mockRestore()
  })
})
