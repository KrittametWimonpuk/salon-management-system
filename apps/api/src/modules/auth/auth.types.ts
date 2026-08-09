import type { AuthenticatedPrincipal } from '../../shared/types/context.js'

export interface CredentialUser {
  id: string
  organizationId: string
  email: string
  passwordHash: string
  displayName: string | null
}

export interface NewSession {
  id: string
  userId: string
  tokenFamilyId: string
  refreshTokenHash: string
  expiresAt: Date
}

export type RotateSessionResult =
  | { status: 'rotated' }
  | { status: 'reused' }
  | { status: 'invalid' }

export interface AuthStore {
  findActiveUser(organizationId: string, email: string): Promise<CredentialUser | null>
  createSession(session: NewSession): Promise<void>
  rotateSession(current: {
    sessionId: string
    userId: string
    organizationId: string
    tokenFamilyId: string
    refreshTokenHash: string
  }, next: NewSession): Promise<RotateSessionResult>
  revokeSession(sessionId: string, userId: string, reason: string): Promise<void>
  loadPrincipal(userId: string, organizationId: string, sessionId: string): Promise<AuthenticatedPrincipal | null>
}

export interface TokenPair {
  accessToken: string
  refreshToken: string
  accessTokenExpiresIn: number
  refreshTokenExpiresAt: Date
}

export interface LoginResult extends TokenPair {
  user: {
    id: string
    organizationId: string
    email: string
    displayName: string | null
  }
}

export interface RefreshResult extends TokenPair {
  subject: {
    userId: string
    organizationId: string
  }
}
