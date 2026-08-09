import { Router, type CookieOptions, type RequestHandler } from 'express'
import { z } from 'zod'
import type { AppConfig } from '../../config/env.js'
import { AppError } from '../../shared/errors/app-error.js'
import { ErrorCode } from '../../shared/errors/error-codes.js'
import { sendSuccess } from '../../shared/http/response.js'
import { asyncHandler } from '../../shared/middleware/async-handler.js'
import { validateBody } from '../../shared/middleware/validate.js'
import type { TenantService } from '../tenant/tenant.service.js'
import { resolveBranchContext } from '../tenant/tenant.middleware.js'
import { authenticate } from './auth.middleware.js'
import type { AuthService } from './auth.service.js'

const loginSchema = z.object({
  organizationId: z.string().uuid(),
  email: z.string().trim().email().max(320).transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(128),
}).strict()

const emptyBodySchema = z.object({}).strict()

function cookieOptions(config: AppConfig, expires?: Date): CookieOptions {
  return {
    httpOnly: true,
    secure: config.cookie.secure,
    sameSite: config.cookie.sameSite,
    path: '/api/auth',
    ...(expires ? { expires } : {}),
  }
}

function trustedOrigin(config: AppConfig): RequestHandler {
  return (request, _response, next) => {
    const origin = request.header('origin')
    if (origin && !config.corsOrigins.has(origin)) {
      next(new AppError({
        code: ErrorCode.SECURITY_ORIGIN_DENIED,
        statusCode: 403,
        message: 'Request origin is not allowed',
      }))
      return
    }
    next()
  }
}

export function createAuthRouter(
  authService: AuthService,
  tenantService: TenantService,
  config: AppConfig,
): Router {
  const router = Router()
  const requireAuth = authenticate(authService)
  const verifyOrigin = trustedOrigin(config)

  router.post('/login', verifyOrigin, validateBody(loginSchema), asyncHandler(async (request, response) => {
    const input = request.body as z.infer<typeof loginSchema>
    response.locals.auditContext = { organizationId: input.organizationId, action: 'auth.login' }
    const result = await authService.login(input)
    response.locals.auditContext.userId = result.user.id
    response.cookie(config.cookie.name, result.refreshToken, cookieOptions(config, result.refreshTokenExpiresAt))
    sendSuccess(response, {
      accessToken: result.accessToken,
      tokenType: 'Bearer',
      expiresIn: result.accessTokenExpiresIn,
      user: result.user,
    })
  }))

  router.post('/refresh', verifyOrigin, validateBody(emptyBodySchema), asyncHandler(async (request, response) => {
    const refreshToken = request.cookies[config.cookie.name] as string | undefined
    if (!refreshToken) {
      throw new AppError({
        code: ErrorCode.AUTH_TOKEN_INVALID,
        statusCode: 401,
        message: 'Refresh token cookie is required',
      })
    }
    const result = await authService.refresh(refreshToken)
    response.locals.auditContext = {
      organizationId: result.subject.organizationId,
      userId: result.subject.userId,
      action: 'auth.refresh',
    }
    response.cookie(config.cookie.name, result.refreshToken, cookieOptions(config, result.refreshTokenExpiresAt))
    sendSuccess(response, {
      accessToken: result.accessToken,
      tokenType: 'Bearer',
      expiresIn: result.accessTokenExpiresIn,
    })
  }))

  router.post('/logout', verifyOrigin, requireAuth, validateBody(emptyBodySchema), asyncHandler(async (request, response) => {
    await authService.logout(request.principal!)
    response.locals.auditContext = {
      organizationId: request.principal!.organizationId,
      userId: request.principal!.userId,
      action: 'auth.logout',
    }
    response.clearCookie(config.cookie.name, cookieOptions(config))
    sendSuccess(response, { loggedOut: true })
  }))

  router.get('/me', requireAuth, resolveBranchContext(tenantService, false), (request, response) => {
    const principal = request.principal!
    const branch = request.branchContext
    sendSuccess(response, {
      user: {
        id: principal.userId,
        organizationId: principal.organizationId,
        email: principal.email,
        displayName: principal.displayName,
      },
      context: {
        branch: branch ? { id: branch.branchId, name: branch.branchName } : null,
        roles: branch?.roles ?? [],
        permissions: branch?.permissions ?? [],
      },
    })
  })

  return router
}
