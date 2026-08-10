import type { AccessibleBranch, AuthorizationContext, OrganizationContext } from '../auth/auth.types'
import { apiRequest } from './client'

export const sessionApi = {
  listBranches(): Promise<{
    organization: OrganizationContext
    branches: AccessibleBranch[]
    primaryBranchId: string | null
  }> {
    return apiRequest('/context/branches', { branch: false })
  },
  switchBranch(branchId: string): Promise<{ branch: { id: string; name: string } } & AuthorizationContext> {
    return apiRequest('/context/branch', {
      method: 'POST',
      body: JSON.stringify({ branchId }),
      branch: false,
    })
  },
}
