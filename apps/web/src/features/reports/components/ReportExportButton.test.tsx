import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ReportExportButton } from './ReportExportButton'

describe('ReportExportButton', () => {
  it('announces and disables its loading state', () => {
    render(<ReportExportButton format="xlsx" loading disabled={false} onClick={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'กำลังส่งออก XLSX' })).toBeDisabled()
  })
})
