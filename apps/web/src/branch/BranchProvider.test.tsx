import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AuthTestProvider, authValue } from '../test/test-utils'
import { BranchProvider } from './BranchProvider'
import { useBranch } from './useBranch'

const sessionApiMocks = vi.hoisted(() => ({ listBranches: vi.fn(), switchBranch: vi.fn() }))
vi.mock('../api/session.api', () => ({ sessionApi: sessionApiMocks }))

function Probe() {
  const branch = useBranch()
  return <span>{branch.currentBranch?.name ?? 'none'}</span>
}

describe('BranchProvider', () => {
  it('selects and resolves the primary branch by default', async () => {
    const updateOrganizationContext = vi.fn()
    sessionApiMocks.listBranches.mockResolvedValue({
      organization: {
        id: 'organization-1',
        name: 'Salon Group',
        displayName: 'Salon Group',
      },
      primaryBranchId: 'branch-2',
      branches: [
        { id: 'branch-1', name: 'First', isPrimary: false },
        { id: 'branch-2', name: 'Primary', isPrimary: true },
      ],
    })
    sessionApiMocks.switchBranch.mockResolvedValue({
      branch: { id: 'branch-2', name: 'Primary' },
      roles: ['Manager'],
      permissions: ['dashboard.read'],
    })

    render(
      <AuthTestProvider value={authValue({ currentBranchContext: null, updateOrganizationContext })}>
        <BranchProvider><Probe /></BranchProvider>
      </AuthTestProvider>,
    )

    await waitFor(() => expect(screen.getByText('Primary')).toBeInTheDocument())
    expect(sessionApiMocks.switchBranch).toHaveBeenCalledWith('branch-2')
    expect(updateOrganizationContext).toHaveBeenCalledWith({
      id: 'organization-1',
      name: 'Salon Group',
      displayName: 'Salon Group',
    })
  })
})
