import { z } from 'zod'
import { AppError } from '../../shared/errors/app-error.js'
import { ErrorCode } from '../../shared/errors/error-codes.js'
import type { AuthenticatedPrincipal, BranchContext } from '../../shared/types/context.js'
import type { TenantStore } from './tenant.store.js'

const branchIdSchema = z.string().uuid()

export class TenantService {
  constructor(private readonly store: TenantStore) {}

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

    const organizationWide = principal.grants.some((grant) => grant.branchId === null)
    const assignedBranchIds = organizationWide
      ? null
      : [...new Set(principal.grants.flatMap((grant) => grant.branchId ? [grant.branchId] : []))]
    const branches = await this.store.findAccessibleBranches(principal.organizationId, assignedBranchIds)

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
}
