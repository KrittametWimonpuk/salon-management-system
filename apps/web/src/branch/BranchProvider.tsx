import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { sessionApi } from '../api/session.api'
import { toSafeError } from '../api/errors'
import { useAuth } from '../auth/useAuth'
import type { AccessibleBranch } from '../auth/auth.types'
import { preferenceStorage } from '../utils/storage'
import { BranchContext, type BranchContextValue } from './branch.context'
import { setActiveBranchId } from './branch-runtime'

export function BranchProvider({ children }: { children: ReactNode }) {
  const auth = useAuth()
  const {
    currentBranchContext,
    isAuthenticated,
    organization,
    updateAuthorizationContext,
    updateOrganizationContext,
  } = auth
  const [branches, setBranches] = useState<AccessibleBranch[]>([])
  const [currentBranch, setCurrentBranchState] = useState<AccessibleBranch | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectBranch = useCallback(async (branch: AccessibleBranch) => {
    setIsLoading(true)
    setError(null)
    try {
      const context = await sessionApi.switchBranch(branch.id)
      setActiveBranchId(branch.id)
      setCurrentBranchState(branch)
      if (organization) preferenceStorage.setBranch(organization.id, branch.id)
      updateAuthorizationContext({
        branch: context.branch,
        roles: context.roles,
        permissions: context.permissions,
      })
    } catch (caught) {
      setError(toSafeError(caught).message)
      throw caught
    } finally {
      setIsLoading(false)
    }
  }, [organization, updateAuthorizationContext])

  const reloadBranches = useCallback(async () => {
    if (!isAuthenticated || !organization) return
    setIsLoading(true)
    setError(null)
    try {
      const result = await sessionApi.listBranches()
      updateOrganizationContext(result.organization)
      setBranches(result.branches)

      const storedId = preferenceStorage.getBranch(organization.id)
      const candidate = result.branches.find((branch) => branch.id === storedId)
        ?? result.branches.find((branch) => branch.id === currentBranchContext?.id)
        ?? result.branches.find((branch) => branch.isPrimary)
        ?? (result.branches.length === 1 ? result.branches[0] ?? null : null)

      if (!candidate) {
        setActiveBranchId(null)
        setCurrentBranchState(null)
        return
      }

      if (candidate.id === currentBranchContext?.id) {
        setActiveBranchId(candidate.id)
        setCurrentBranchState(candidate)
        preferenceStorage.setBranch(organization.id, candidate.id)
      } else {
        const context = await sessionApi.switchBranch(candidate.id)
        setActiveBranchId(candidate.id)
        setCurrentBranchState(candidate)
        preferenceStorage.setBranch(organization.id, candidate.id)
        updateAuthorizationContext({
          branch: context.branch,
          roles: context.roles,
          permissions: context.permissions,
        })
      }
    } catch (caught) {
      setError(toSafeError(caught).message)
    } finally {
      setIsLoading(false)
    }
  }, [currentBranchContext?.id, isAuthenticated, organization, updateAuthorizationContext, updateOrganizationContext])

  useEffect(() => {
    if (!isAuthenticated) {
      setBranches([])
      setCurrentBranchState(null)
      setActiveBranchId(null)
      return
    }
    void reloadBranches()
  }, [isAuthenticated, organization?.id, reloadBranches])

  const setCurrentBranch = useCallback(async (branchId: string) => {
    const branch = branches.find((item) => item.id === branchId)
    if (!branch) throw new Error('Branch is not accessible')
    if (branch.id === currentBranch?.id) return
    await selectBranch(branch)
  }, [branches, currentBranch?.id, selectBranch])

  const value = useMemo<BranchContextValue>(() => ({
    accessibleBranches: branches,
    currentBranch,
    primaryBranch: branches.find((branch) => branch.isPrimary) ?? null,
    isLoading,
    requiresSelection: !isLoading && branches.length > 1 && !currentBranch,
    error,
    setCurrentBranch,
    reloadBranches,
  }), [branches, currentBranch, error, isLoading, reloadBranches, setCurrentBranch])

  return <BranchContext.Provider value={value}>{children}</BranchContext.Provider>
}
