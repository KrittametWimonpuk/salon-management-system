import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { AuthTestProvider, authValue } from '../test/test-utils'
import { PermissionGate } from './PermissionGate'
import { ProtectedRoute } from './ProtectedRoute'

describe('route and permission controls', () => {
  it('redirects an unauthenticated request to login', () => {
    const value = authValue({ currentUser: null, organization: null, accessToken: null, isAuthenticated: false, sessionStatus: 'unauthenticated' })
    render(
      <AuthTestProvider value={value}>
        <MemoryRouter initialEntries={['/admin']}>
          <Routes>
            <Route path="/admin" element={<ProtectedRoute><span>private</span></ProtectedRoute>} />
            <Route path="/login" element={<span>login page</span>} />
          </Routes>
        </MemoryRouter>
      </AuthTestProvider>,
    )
    expect(screen.getByText('login page')).toBeInTheDocument()
  })

  it('hides unauthorized PermissionGate content', () => {
    render(
      <AuthTestProvider value={authValue({ permissions: [] })}>
        <PermissionGate permission="dashboard.read"><span>dashboard link</span></PermissionGate>
      </AuthTestProvider>,
    )
    expect(screen.queryByText('dashboard link')).not.toBeInTheDocument()
  })
})
