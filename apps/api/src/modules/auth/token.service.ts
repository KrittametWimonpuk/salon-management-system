import { createHash, randomUUID } from 'node:crypto'
import jwt from 'jsonwebtoken'
import { z } from 'zod'
import type { AppConfig } from '../../config/env.js'
import { AppError } from '../../shared/errors/app-error.js'
import { ErrorCode } from '../../shared/errors/error-codes.js'

const accessClaimsSchema = z.object({
  sub: z.string().uuid(),
  org: z.string().uuid(),
  sid: z.string().uuid(),
  typ: z.literal('access'),
  jti: z.string().uuid(),
})

const refreshClaimsSchema = z.object({
  sub: z.string().uuid(),
  org: z.string().uuid(),
  sid: z.string().uuid(),
  fid: z.string().uuid(),
  typ: z.literal('refresh'),
  jti: z.string().uuid(),
})

export type AccessClaims = z.infer<typeof accessClaimsSchema>
export type RefreshClaims = z.infer<typeof refreshClaimsSchema>

export class TokenService {
  constructor(private readonly config: AppConfig['jwt']) {}

  issueAccessToken(input: { userId: string; organizationId: string; sessionId: string }): string {
    return jwt.sign(
      { org: input.organizationId, sid: input.sessionId, typ: 'access' },
      this.config.accessSecret,
      {
        algorithm: 'HS256',
        audience: this.config.audience,
        issuer: this.config.issuer,
        subject: input.userId,
        jwtid: randomUUID(),
        expiresIn: this.config.accessTtlSeconds,
      },
    )
  }

  issueRefreshToken(input: {
    userId: string
    organizationId: string
    sessionId: string
    tokenFamilyId: string
  }): string {
    return jwt.sign(
      { org: input.organizationId, sid: input.sessionId, fid: input.tokenFamilyId, typ: 'refresh' },
      this.config.refreshSecret,
      {
        algorithm: 'HS256',
        audience: this.config.audience,
        issuer: this.config.issuer,
        subject: input.userId,
        jwtid: randomUUID(),
        expiresIn: this.config.refreshTtlSeconds,
      },
    )
  }

  verifyAccessToken(token: string): AccessClaims {
    return this.verify(token, this.config.accessSecret, accessClaimsSchema)
  }

  verifyRefreshToken(token: string): RefreshClaims {
    return this.verify(token, this.config.refreshSecret, refreshClaimsSchema)
  }

  hashRefreshToken(token: string): string {
    return createHash('sha256').update(token, 'utf8').digest('hex')
  }

  private verify<T>(token: string, secret: string, schema: z.ZodType<T>): T {
    try {
      const payload = jwt.verify(token, secret, {
        algorithms: ['HS256'],
        audience: this.config.audience,
        issuer: this.config.issuer,
      })
      const result = schema.safeParse(payload)
      if (!result.success) throw new Error('Unexpected token claims')
      return result.data
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new AppError({
          code: ErrorCode.AUTH_TOKEN_EXPIRED,
          statusCode: 401,
          message: 'Authentication token has expired',
        })
      }
      throw new AppError({
        code: ErrorCode.AUTH_TOKEN_INVALID,
        statusCode: 401,
        message: 'Authentication token is invalid',
      })
    }
  }
}
