import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DashboardPage } from './DashboardPage'
import { AuthTestProvider, BranchTestProvider, authValue } from '../../test/test-utils'

const overview = {
  totalBookings: 12, completedBookings: 9, cancelledBookings: 2, noShowBookings: 1,
  totalCustomers: 8, newCustomers: 3, returningCustomers: 5, grossSales: 150000, discountTotal: 5000,
  taxTotal: 0, netSales: 145000, paidAmount: 140000, refundedAmount: 1000, voidedAmount: 0,
  outstandingAmount: 5000, commissionTotal: 20000, commissionAdjustmentTotal: -500, averageTicketSize: 12083,
  averageSpendPerCustomer: 18125, topService: 'Hair Color', topEmployee: 'May', topBranch: 'Main',
  timezone: 'Asia/Bangkok', dateFrom: '2026-08-01T00:00:00.000Z', dateTo: '2026-09-01T00:00:00.000Z',
}

function response(data: unknown, status = 200) {
  return new Response(JSON.stringify(status === 200 ? { success: true, data, meta: {} } : { success: false, error: { code: 'INTERNAL_001', message: 'failed', details: [] } }), { status, headers: { 'Content-Type': 'application/json' } })
}

function renderDashboard(permissions = ['dashboard.read']) {
  return render(<AuthTestProvider value={authValue({ permissions })}><BranchTestProvider><DashboardPage /></BranchTestProvider></AuthTestProvider>)
}

describe('DashboardPage', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('renders summary cards and leading performers from the overview API', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(overview)))
    renderDashboard()
    expect(await screen.findByText('Hair Color')).toBeInTheDocument()
    expect(screen.getByText('฿1,450.00')).toBeInTheDocument()
    expect(screen.getByText('May')).toBeInTheDocument()
  })

  it('renders a loading state while overview data is pending', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => undefined)))
    renderDashboard()
    expect(screen.getByLabelText('กำลังโหลดตัวเลขสรุป')).toBeInTheDocument()
  })

  it('renders a retryable error without exposing backend internals', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(null, 500)))
    renderDashboard()
    expect(await screen.findByText('โหลดข้อมูลไม่สำเร็จ')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'ลองอีกครั้ง' })).toBeInTheDocument()
  })

  it('does not request or render sections without their permission', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(overview))
    vi.stubGlobal('fetch', fetchMock)
    renderDashboard()
    await screen.findByText('Hair Color')
    expect(screen.queryByRole('heading', { name: 'ค่าคอมมิชชัน' })).not.toBeInTheDocument()
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
  })
})
