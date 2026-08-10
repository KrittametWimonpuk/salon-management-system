import type { ReactNode } from 'react'
import { AuthContext, type AuthContextValue } from '../auth/auth.context'

export function authValue(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  const permissions = overrides.permissions ?? ['dashboard.read']
  return {
    currentUser: {
      id: '20000000-0000-4000-8000-000000000001',
      organizationId: '10000000-0000-4000-8000-000000000001',
      email: 'owner@example.test',
      displayName: 'Owner',
    },
    organization: {
      id: '10000000-0000-4000-8000-000000000001',
      name: 'Salon Test Organization',
      displayName: 'Salon Test Organization',
    },
    permissions,
    roles: ['Owner'],
    currentBranchContext: { id: '30000000-0000-4000-8000-000000000001', name: 'Main' },
    sessionStatus: 'authenticated',
    accessToken: 'access-token',
    isAuthenticated: true,
    login: async () => undefined,
    logout: async () => undefined,
    refreshSession: async () => undefined,
    updateOrganizationContext: () => undefined,
    updateAuthorizationContext: () => undefined,
    recoverFromForbidden: () => undefined,
    ...overrides,
    hasPermission: overrides.hasPermission ?? ((permission) => permissions.includes(permission)),
  }
}

export function AuthTestProvider({ value, children }: { value: AuthContextValue; children: ReactNode }) {
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
