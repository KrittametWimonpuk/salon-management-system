import { createContext } from 'react'
import type {
  AuthUser,
  AuthorizationContext,
  LoginCredentials,
  OrganizationContext,
  SessionBranch,
  SessionStatus,
} from './auth.types'

export interface AuthContextValue {
  currentUser: AuthUser | null
  organization: OrganizationContext | null
  permissions: readonly string[]
  roles: readonly string[]
  currentBranchContext: SessionBranch | null
  sessionStatus: SessionStatus
  accessToken: string | null
  isAuthenticated: boolean
  login: (credentials: LoginCredentials) => Promise<void>
  logout: () => Promise<void>
  refreshSession: () => Promise<void>
  hasPermission: (permission: string) => boolean
  updateOrganizationContext: (organization: OrganizationContext) => void
  updateAuthorizationContext: (context: AuthorizationContext & { branch: SessionBranch | null }) => void
  recoverFromForbidden: () => void
}

export const AuthContext = createContext<AuthContextValue | null>(null)
