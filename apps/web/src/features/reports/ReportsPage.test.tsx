import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ReportsPage } from './ReportsPage'
import { AuthTestProvider, authValue } from '../../test/test-utils'

describe('ReportsPage', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('renders only report cards allowed by domain permissions', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true, data: [
      { type: 'sales', formats: ['json', 'csv', 'xlsx'] }, { type: 'commissions', formats: ['json', 'csv', 'xlsx'] },
    ], meta: {} }), { headers: { 'Content-Type': 'application/json' } })))
    render(<MemoryRouter><AuthTestProvider value={authValue({ permissions: ['report.read', 'sales.summary.read'] })}><ReportsPage /></AuthTestProvider></MemoryRouter>)
    expect(await screen.findByRole('heading', { name: 'รายงานยอดขาย' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'รายงานค่าคอมมิชชัน' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /เปิดรายงาน/ })).toHaveAttribute('href', '/admin/reports/sales')
  })
})
