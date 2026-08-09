import type { RequestHandler } from 'express'
import { AppError } from '../../shared/errors/app-error.js'
import { ErrorCode } from '../../shared/errors/error-codes.js'

export function requirePermission(permissionKey: string): RequestHandler {
  return (request, _response, next) => {
    const permissions = request.branchContext?.permissions
      ?? request.principal?.grants
        .filter((grant) => grant.branchId === null)
        .flatMap((grant) => grant.permissions)
      ?? []

    if (!new Set(permissions).has(permissionKey)) {
      next(new AppError({
        code: ErrorCode.PERMISSION_DENIED,
        statusCode: 403,
        message: 'The current role does not grant the required permission',
      }))
      return
    }
    next()
  }
}
