import { createContext } from 'react'
import type { AccessibleBranch } from '../auth/auth.types'

export interface BranchContextValue {
  accessibleBranches: readonly AccessibleBranch[]
  currentBranch: AccessibleBranch | null
  primaryBranch: AccessibleBranch | null
  isLoading: boolean
  requiresSelection: boolean
  error: string | null
  setCurrentBranch: (branchId: string) => Promise<void>
  reloadBranches: () => Promise<void>
}

export const BranchContext = createContext<BranchContextValue | null>(null)
