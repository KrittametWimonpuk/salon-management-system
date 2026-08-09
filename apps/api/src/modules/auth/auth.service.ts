import { randomUUID } from 'node:crypto'
import type { AppConfig } from '../../config/env.js'
import { AppError } from '../../shared/errors/app-error.js'
import { ErrorCode } from '../../shared/errors/error-codes.js'
import type { AuthenticatedPrincipal } from '../../shared/types/context.js'
import type { AuthStore, LoginResult, NewSession, RefreshResult, TokenPair } from './auth.types.js'
import type { PasswordService } from './password.service.js'
import type { TokenService } from './token.service.js'

export class AuthService {
  constructor(
    private readonly store: AuthStore,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly jwtConfig: AppConfig['jwt'],
    private readonly now: () => Date = () => new Date(),
  ) {}

  async login(input: { organizationId: string; email: string; password: string }): Promise<LoginResult> {
    const user = await this.store.findActiveUser(input.organizationId, input.email)
    const passwordValid = await this.passwords.verify(input.password, user?.passwordHash ?? null)
    if (!user || !passwordValid) {
      throw new AppError({
        code: ErrorCode.AUTH_INVALID_CREDENTIALS,
        statusCode: 401,
        message: 'Organization, email, or password is invalid',
      })
    }

    const tokenFamilyId = randomUUID()
    const sessionId = randomUUID()
    const pair = this.createTokenPair(user.id, user.organizationId, sessionId, tokenFamilyId)
    await this.store.createSession(this.newSession({
      id: sessionId,
      userId: user.id,
      tokenFamilyId,
      refreshToken: pair.refreshToken,
      expiresAt: pair.refreshTokenExpiresAt,
    }))

    return {
      ...pair,
      user: {
        id: user.id,
        organizationId: user.organizationId,
        email: user.email,
        displayName: user.displayName,
      },
    }
  }

  async refresh(refreshToken: string): Promise<RefreshResult> {
    const claims = this.tokens.verifyRefreshToken(refreshToken)
    const nextSessionId = randomUUID()
    const pair = this.createTokenPair(claims.sub, claims.org, nextSessionId, claims.fid)
    const result = await this.store.rotateSession({
      sessionId: claims.sid,
      userId: claims.sub,
      organizationId: claims.org,
      tokenFamilyId: claims.fid,
      refreshTokenHash: this.tokens.hashRefreshToken(refreshToken),
    }, this.newSession({
      id: nextSessionId,
      userId: claims.sub,
      tokenFamilyId: claims.fid,
      refreshToken: pair.refreshToken,
      expiresAt: pair.refreshTokenExpiresAt,
    }))

    if (result.status === 'reused') {
      throw new AppError({
        code: ErrorCode.AUTH_TOKEN_REUSED,
        statusCode: 401,
        message: 'Refresh token reuse was detected; the session family has been revoked',
      })
    }
    if (result.status === 'invalid') {
      throw new AppError({
        code: ErrorCode.AUTH_SESSION_REVOKED,
        statusCode: 401,
        message: 'Authentication session is no longer active',
      })
    }
    return {
      ...pair,
      subject: { userId: claims.sub, organizationId: claims.org },
    }
  }

  async logout(principal: AuthenticatedPrincipal): Promise<void> {
    await this.store.revokeSession(principal.sessionId, principal.userId, 'LOGOUT')
  }

  async authenticate(accessToken: string): Promise<AuthenticatedPrincipal> {
    const claims = this.tokens.verifyAccessToken(accessToken)
    const principal = await this.store.loadPrincipal(claims.sub, claims.org, claims.sid)
    if (!principal) {
      throw new AppError({
        code: ErrorCode.AUTH_SESSION_REVOKED,
        statusCode: 401,
        message: 'Authentication session is no longer active',
      })
    }
    return principal
  }

  private createTokenPair(
    userId: string,
    organizationId: string,
    sessionId: string,
    tokenFamilyId: string,
  ): TokenPair {
    const refreshToken = this.tokens.issueRefreshToken({ userId, organizationId, sessionId, tokenFamilyId })
    return {
      accessToken: this.tokens.issueAccessToken({ userId, organizationId, sessionId }),
      refreshToken,
      accessTokenExpiresIn: this.jwtConfig.accessTtlSeconds,
      refreshTokenExpiresAt: new Date(this.now().getTime() + this.jwtConfig.refreshTtlSeconds * 1000),
    }
  }

  private newSession(input: {
    id: string
    userId: string
    tokenFamilyId: string
    refreshToken: string
    expiresAt: Date
  }): NewSession {
    return {
      id: input.id,
      userId: input.userId,
      tokenFamilyId: input.tokenFamilyId,
      refreshTokenHash: this.tokens.hashRefreshToken(input.refreshToken),
      expiresAt: input.expiresAt,
    }
  }
}
