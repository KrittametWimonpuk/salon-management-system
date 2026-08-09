import type { RequestHandler } from 'express'
import { AppError } from '../../shared/errors/app-error.js'
import { ErrorCode } from '../../shared/errors/error-codes.js'
import { asyncHandler } from '../../shared/middleware/async-handler.js'
import type { TenantService } from './tenant.service.js'

export function resolveBranchContext(tenantService: TenantService, required: boolean): RequestHandler {
  return asyncHandler(async (request, response, next) => {
    if (!request.principal) {
      throw new AppError({
        code: ErrorCode.AUTH_TOKEN_INVALID,
        statusCode: 401,
        message: 'Authentication is required before resolving branch context',
      })
    }
    const branchContext = await tenantService.resolveBranch(
      request.principal,
      request.header('x-branch-id'),
      required,
    )
    if (branchContext) {
      request.branchContext = branchContext
      response.locals.auditContext = {
        organizationId: request.principal.organizationId,
        userId: request.principal.userId,
        branchId: branchContext.branchId,
      }
    }
    next()
  })
}
