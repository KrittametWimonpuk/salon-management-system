import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ReportPagination } from './ReportPagination'

describe('ReportPagination', () => {
  it('moves between bounded pages', async () => {
    const onPage = vi.fn()
    render(<ReportPagination page={2} totalPages={4} totalItems={75} onPage={onPage} />)
    await userEvent.click(screen.getByRole('button', { name: 'หน้าก่อนหน้า' }))
    await userEvent.click(screen.getByRole('button', { name: 'หน้าถัดไป' }))
    expect(onPage).toHaveBeenNthCalledWith(1, 1)
    expect(onPage).toHaveBeenNthCalledWith(2, 3)
  })
})
