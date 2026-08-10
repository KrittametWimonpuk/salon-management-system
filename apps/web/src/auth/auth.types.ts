export type SessionStatus = 'loading' | 'authenticated' | 'unauthenticated' | 'forbidden' | 'expired'

export interface LoginCredentials {
  organizationId: string
  email: string
  password: string
}

export interface AuthUser {
  id: string
  organizationId: string
  email: string
  displayName: string | null
}

export interface OrganizationContext {
  id: string
  name: string
  displayName: string
}

export interface SessionBranch {
  id: string
  name: string
}

export interface AccessibleBranch extends SessionBranch {
  isPrimary: boolean
}

export interface AuthorizationContext {
  roles: string[]
  permissions: string[]
}

export interface AuthSessionResponse {
  user: AuthUser
  context: AuthorizationContext & {
    branch: SessionBranch | null
  }
}
