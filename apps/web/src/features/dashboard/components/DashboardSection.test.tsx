import { render, screen } from '@testing-library/react'
import { BarChart3 } from 'lucide-react'
import { describe, expect, it, vi } from 'vitest'
import { DashboardSection } from './DashboardSection'

describe('DashboardSection', () => {
  it('shows the polite empty state for a successful empty response', () => {
    render(<DashboardSection title="ทดสอบ" description="รายละเอียด" icon={BarChart3}
      resource={{ data: [], error: null, status: 'success', reload: vi.fn() }} empty={(rows) => rows.length === 0}>
      {() => <p>content</p>}
    </DashboardSection>)
    expect(screen.getByText('ยังไม่มีข้อมูลในช่วงเวลานี้')).toBeInTheDocument()
    expect(screen.queryByText('content')).not.toBeInTheDocument()
  })
})
