import { z } from 'zod'
import { AppError } from '../../shared/errors/app-error.js'
import { ErrorCode } from '../../shared/errors/error-codes.js'
import type { AuthenticatedPrincipal, BranchContext } from '../../shared/types/context.js'
import type { TenantStore } from './tenant.store.js'

const branchIdSchema = z.string().uuid()

export class TenantService {
  constructor(private readonly store: TenantStore) {}

  async getWorkspaceContext(principal: AuthenticatedPrincipal) {
    const [organization, branches] = await Promise.all([
      this.store.findOrganization(principal.organizationId),
      this.listAccessibleBranches(principal),
    ])
    if (!organization) {
      throw new AppError({
        code: ErrorCode.TENANT_CONTEXT_INVALID,
        statusCode: 403,
        message: 'Organization context is unavailable',
      })
    }

    const displayName = organization.name.trim() || organization.id
    return {
      organization: { ...organization, displayName },
      branches,
    }
  }

  async listAccessibleBranches(principal: AuthenticatedPrincipal): Promise<readonly {
    id: string
    name: string
    isPrimary: boolean
  }[]> {
    const branches = await this.findAccessibleBranches(principal)
    return branches.map((branch) => ({
      ...branch,
      isPrimary: branch.id === principal.primaryBranchId,
    }))
  }

  async resolveBranch(
    principal: AuthenticatedPrincipal,
    requestedBranchId: string | undefined,
    required: boolean,
  ): Promise<BranchContext | undefined> {
    if (requestedBranchId && !branchIdSchema.safeParse(requestedBranchId).success) {
      throw new AppError({
        code: ErrorCode.TENANT_CONTEXT_INVALID,
        statusCode: 400,
        message: 'Branch context is invalid',
      })
    }

    const branches = await this.findAccessibleBranches(principal)

    let selected = requestedBranchId
      ? branches.find((branch) => branch.id === requestedBranchId)
      : undefined

    if (requestedBranchId && !selected) {
      throw new AppError({
        code: ErrorCode.TENANT_BRANCH_FORBIDDEN,
        statusCode: 403,
        message: 'User does not have access to the requested branch',
      })
    }

    if (!selected && principal.primaryBranchId) {
      selected = branches.find((branch) => branch.id === principal.primaryBranchId)
    }
    if (!selected && branches.length === 1) selected = branches[0]

    if (!selected) {
      if (!required) return undefined
      throw new AppError({
        code: ErrorCode.TENANT_BRANCH_REQUIRED,
        statusCode: 400,
        message: 'X-Branch-ID is required when no unambiguous default branch exists',
      })
    }

    const activeGrants = principal.grants.filter(
      (grant) => grant.branchId === null || grant.branchId === selected.id,
    )
    return {
      branchId: selected.id,
      branchName: selected.name,
      roles: [...new Set(activeGrants.map((grant) => grant.roleName))],
      permissions: [...new Set(activeGrants.flatMap((grant) => grant.permissions))],
    }
  }

  private findAccessibleBranches(principal: AuthenticatedPrincipal) {
    const organizationWide = principal.grants.some((grant) => grant.branchId === null)
    const assignedBranchIds = organizationWide
      ? null
      : [...new Set(principal.grants.flatMap((grant) => grant.branchId ? [grant.branchId] : []))]
    return this.store.findAccessibleBranches(principal.organizationId, assignedBranchIds)
  }
}
