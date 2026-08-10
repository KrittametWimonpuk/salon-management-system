import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BranchContext, type BranchContextValue } from '../branch/branch.context'
import { AuthTestProvider, authValue } from '../test/test-utils'
import { DashboardShellPage } from './DashboardShellPage'

const branchValue: BranchContextValue = {
  accessibleBranches: [{ id: 'branch-1', name: 'Main', isPrimary: true }],
  currentBranch: { id: 'branch-1', name: 'Main', isPrimary: true },
  primaryBranch: { id: 'branch-1', name: 'Main', isPrimary: true },
  isLoading: false,
  requiresSelection: false,
  error: null,
  setCurrentBranch: async () => undefined,
  reloadBranches: async () => undefined,
}

describe('DashboardShellPage', () => {
  it('renders the authoritative organization display name', () => {
    render(
      <AuthTestProvider value={authValue()}>
        <BranchContext.Provider value={branchValue}>
          <DashboardShellPage />
        </BranchContext.Provider>
      </AuthTestProvider>,
    )

    expect(screen.getByText('Salon Test Organization')).toBeInTheDocument()
  })
})
