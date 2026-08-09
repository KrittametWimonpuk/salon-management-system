import { describe, expect, it } from 'vitest'
import { TenantService } from '../../src/modules/tenant/tenant.service.js'
import { ErrorCode } from '../../src/shared/errors/error-codes.js'
import type { AuthenticatedPrincipal } from '../../src/shared/types/context.js'
import { FakeTenantStore, ids } from '../helpers/fakes.js'

function principal(): AuthenticatedPrincipal {
  return {
    userId: ids.user,
    organizationId: ids.organization,
    sessionId: ids.role,
    email: 'owner@example.test',
    displayName: 'Owner',
    employeeId: null,
    primaryBranchId: ids.branch,
    grants: [{
      roleId: ids.role,
      roleName: 'Owner',
      branchId: null,
      permissions: ['booking.read'],
    }],
  }
}

describe('TenantService', () => {
  it('uses the authenticated organization for every branch lookup', async () => {
    const store = new FakeTenantStore()
    const context = await new TenantService(store).resolveBranch(principal(), undefined, true)
    expect(store.lastOrganizationId).toBe(ids.organization)
    expect(context?.branchId).toBe(ids.branch)
  })

  it('rejects a branch outside the accessible organization scope', async () => {
    const store = new FakeTenantStore()
    await expect(new TenantService(store).resolveBranch(principal(), ids.otherBranch, true))
      .rejects.toMatchObject({ code: ErrorCode.TENANT_BRANCH_FORBIDDEN })
  })
})
