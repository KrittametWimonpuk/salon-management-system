import type { DomainError } from '../../domain/foundation/domain-errors.js'
import { AppError } from '../errors/app-error.js'
import { ErrorCode } from '../errors/error-codes.js'

export function unwrapResult<T>(result: { ok: true; value: T } | { ok: false; error: DomainError }): T {
  if (result.ok) return result.value
  throw domainErrorToAppError(result.error)
}

export function domainErrorToAppError(error: DomainError): AppError {
  switch (error.code) {
    case 'VALIDATION': return new AppError({ code: ErrorCode.VALIDATION_FAILED, statusCode: 400, message: error.message })
    case 'NOT_FOUND': return new AppError({ code: ErrorCode.NOT_FOUND, statusCode: 404, message: error.message })
    case 'FORBIDDEN': return new AppError({ code: ErrorCode.PERMISSION_DENIED, statusCode: 403, message: error.message })
    case 'TENANT_ISOLATION': return new AppError({ code: ErrorCode.TENANT_BRANCH_FORBIDDEN, statusCode: 403, message: error.message })
    case 'CONFLICT': return new AppError({ code: ErrorCode.DOMAIN_CONFLICT, statusCode: 409, message: error.message })
    case 'CONCURRENCY': return new AppError({ code: ErrorCode.CONCURRENCY_CONFLICT, statusCode: 409, message: error.message })
    case 'BUSINESS_RULE_VIOLATION': return new AppError({ code: ErrorCode.BUSINESS_RULE_VIOLATION, statusCode: 422, message: error.message })
  }
}
