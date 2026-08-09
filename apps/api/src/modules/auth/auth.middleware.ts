import type { RequestHandler } from 'express'
import { AppError } from '../../shared/errors/app-error.js'
import { ErrorCode } from '../../shared/errors/error-codes.js'
import { asyncHandler } from '../../shared/middleware/async-handler.js'
import type { AuthService } from './auth.service.js'

export function authenticate(authService: AuthService): RequestHandler {
  return asyncHandler(async (request, _response, next) => {
    const authorization = request.header('authorization')
    const match = /^Bearer ([^\s]+)$/.exec(authorization ?? '')
    if (!match?.[1]) {
      throw new AppError({
        code: ErrorCode.AUTH_TOKEN_INVALID,
        statusCode: 401,
        message: 'Bearer access token is required',
      })
    }
    request.principal = await authService.authenticate(match[1])
    next()
  })
}
