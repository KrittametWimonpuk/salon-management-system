import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { StrictMode, useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/errors'
import { AuthProvider } from './AuthProvider'
import { useAuth } from './useAuth'

const authApiMocks = vi.hoisted(() => ({
  login: vi.fn(),
  refresh: vi.fn(),
  me: vi.fn(),
  logout: vi.fn(),
}))

vi.mock('../api/auth.api', () => ({ authApi: authApiMocks }))

const session = {
  user: {
    id: 'user-1',
    organizationId: '10000000-0000-4000-8000-000000000001',
    email: 'owner@example.test',
    displayName: 'Owner',
  },
  context: {
    branch: { id: 'branch-1', name: 'Main' },
    roles: ['Owner'],
    permissions: ['dashboard.read'],
  },
}

function Probe() {
  const auth = useAuth()
  const [error, setError] = useState('')
  return (
    <div>
      <span data-testid="status">{auth.sessionStatus}</span>
      <span data-testid="user">{auth.currentUser?.email ?? '-'}</span>
      <span data-testid="token">{auth.accessToken ?? '-'}</span>
      <span data-testid="error">{error}</span>
      <button type="button" onClick={() => { void auth.login({ organizationId: session.user.organizationId, email: session.user.email, password: 'password-123' }).catch((caught: Error) => setError(caught.message)) }}>login</button>
      <button type="button" onClick={() => { void auth.logout() }}>logout</button>
    </div>
  )
}

let organizationProbeRenders = 0
function OrganizationProbe() {
  const auth = useAuth()
  organizationProbeRenders += 1
  const organization = {
    id: session.user.organizationId,
    name: 'Salon Group',
    displayName: 'Salon Group',
  }
  return <button type="button" onClick={() => auth.updateOrganizationContext(organization)}>organization {auth.organization?.displayName}</button>
}

describe('AuthProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    sessionStorage.clear()
    authApiMocks.refresh.mockRejectedValue(new ApiError({ code: 'AUTH_002', message: '', status: 401 }))
    authApiMocks.logout.mockResolvedValue({ loggedOut: true })
    organizationProbeRenders = 0
  })

  it('loads user context after a successful login and keeps the access token in memory', async () => {
    authApiMocks.login.mockResolvedValue({ accessToken: 'access-1', tokenType: 'Bearer', expiresIn: 900, user: session.user })
    authApiMocks.me.mockResolvedValue(session)
    render(<AuthProvider><Probe /></AuthProvider>)
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated'))

    fireEvent.click(screen.getByText('login'))
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'))
    expect(screen.getByTestId('user')).toHaveTextContent('owner@example.test')
    expect(screen.getByTestId('token')).toHaveTextContent('access-1')
    expect(localStorage.length).toBe(0)
    expect(sessionStorage.length).toBe(0)
    expect(document.cookie).not.toContain('salon_refresh')
  })

  it('returns a safe login failure and keeps the session unauthenticated', async () => {
    authApiMocks.login.mockRejectedValue(new ApiError({ code: 'AUTH_001', message: 'invalid', status: 401 }))
    render(<AuthProvider><Probe /></AuthProvider>)
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated'))

    fireEvent.click(screen.getByText('login'))
    await waitFor(() => expect(screen.getByTestId('error')).toHaveTextContent('ข้อมูลองค์กร อีเมล หรือรหัสผ่านไม่ถูกต้อง'))
    expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated')
  })

  it('clears the in-memory session after logout', async () => {
    authApiMocks.refresh.mockResolvedValue({ accessToken: 'access-1', tokenType: 'Bearer', expiresIn: 900 })
    authApiMocks.me.mockResolvedValue(session)
    render(<AuthProvider><Probe /></AuthProvider>)
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'))

    fireEvent.click(screen.getByText('logout'))
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated'))
    expect(screen.getByTestId('token')).toHaveTextContent('-')
    expect(authApiMocks.logout).toHaveBeenCalledOnce()
  })

  it('reuses the bootstrap request during Strict Mode effect replay', async () => {
    authApiMocks.refresh.mockResolvedValue({ accessToken: 'access-1', tokenType: 'Bearer', expiresIn: 900 })
    authApiMocks.me.mockResolvedValue(session)

    render(<StrictMode><AuthProvider><Probe /></AuthProvider></StrictMode>)

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'))
    expect(authApiMocks.refresh).toHaveBeenCalledOnce()
    expect(authApiMocks.me).toHaveBeenCalledOnce()
  })

  it('does not re-render when tenant discovery repeats the same organization context', async () => {
    authApiMocks.refresh.mockResolvedValue({ accessToken: 'access-1', tokenType: 'Bearer', expiresIn: 900 })
    authApiMocks.me.mockResolvedValue(session)
    render(<AuthProvider><OrganizationProbe /></AuthProvider>)
    await waitFor(() => expect(screen.getByRole('button')).toHaveTextContent(session.user.organizationId))

    fireEvent.click(screen.getByRole('button'))
    await waitFor(() => expect(screen.getByRole('button')).toHaveTextContent('Salon Group'))
    const rendersAfterAuthoritativeContext = organizationProbeRenders
    fireEvent.click(screen.getByRole('button'))

    expect(organizationProbeRenders).toBe(rendersAfterAuthoritativeContext)
  })
})
