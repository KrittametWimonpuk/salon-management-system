import { Router } from 'express'
import { z } from 'zod'
import { sendSuccess } from '../../shared/http/response.js'
import { asyncHandler } from '../../shared/middleware/async-handler.js'
import { validateBody } from '../../shared/middleware/validate.js'
import type { AuthService } from '../auth/auth.service.js'
import { authenticate } from '../auth/auth.middleware.js'
import type { TenantService } from './tenant.service.js'

const switchBranchSchema = z.object({ branchId: z.string().uuid() }).strict()

export function createTenantRouter(authService: AuthService, tenantService: TenantService): Router {
  const router = Router()
  const requireAuth = authenticate(authService)

  router.get('/branches', requireAuth, asyncHandler(async (request, response) => {
    const context = await tenantService.getWorkspaceContext(request.principal!)
    sendSuccess(response, {
      organization: context.organization,
      branches: context.branches,
      primaryBranchId: context.branches.find((branch) => branch.isPrimary)?.id ?? null,
    })
  }))

  router.post('/branch', requireAuth, validateBody(switchBranchSchema), asyncHandler(async (request, response) => {
    const { branchId } = request.body as z.infer<typeof switchBranchSchema>
    const branch = await tenantService.resolveBranch(request.principal!, branchId, true)
    response.locals.auditContext = {
      organizationId: request.principal!.organizationId,
      userId: request.principal!.userId,
      branchId,
      action: 'tenant.switch_branch',
    }
    sendSuccess(response, {
      branch: { id: branch!.branchId, name: branch!.branchName },
      roles: branch!.roles,
      permissions: branch!.permissions,
    })
  }))
  return router
}
