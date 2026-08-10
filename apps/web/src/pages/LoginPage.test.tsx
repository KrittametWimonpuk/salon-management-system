import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { AuthTestProvider, authValue } from '../test/test-utils'
import { LoginPage } from './LoginPage'

describe('LoginPage', () => {
  it('shows field validation errors before sending invalid credentials', () => {
    render(
      <AuthTestProvider value={authValue({ currentUser: null, organization: null, accessToken: null, isAuthenticated: false, sessionStatus: 'unauthenticated' })}>
        <MemoryRouter><LoginPage /></MemoryRouter>
      </AuthTestProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'เข้าสู่ระบบ' }))
    expect(screen.getByText('กรอก Organization ID ในรูปแบบ UUID')).toBeInTheDocument()
    expect(screen.getByText('กรอกอีเมลให้ถูกต้อง')).toBeInTheDocument()
    expect(screen.getByText('รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร')).toBeInTheDocument()
  })
})
