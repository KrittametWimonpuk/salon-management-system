import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { authApi } from '../api/auth.api'
import { configureApiRuntime } from '../api/client'
import { getActiveBranchId, setActiveBranchId } from '../branch/branch-runtime'
import { AuthContext, type AuthContextValue } from './auth.context'
import type {
  AuthSessionResponse,
  AuthUser,
  AuthorizationContext,
  LoginCredentials,
  OrganizationContext,
  SessionBranch,
  SessionStatus,
} from './auth.types'

interface AuthState {
  user: AuthUser | null
  organization: OrganizationContext | null
  branch: SessionBranch | null
  permissions: string[]
  roles: string[]
  status: SessionStatus
}

const INITIAL_STATE: AuthState = {
  user: null,
  organization: null,
  branch: null,
  permissions: [],
  roles: [],
  status: 'loading',
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(INITIAL_STATE)
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const tokenRef = useRef<string | null>(null)
  const bootstrapPromiseRef = useRef<Promise<{ token: string; session: AuthSessionResponse }> | null>(null)

  const storeToken = useCallback((token: string | null) => {
    tokenRef.current = token
    setAccessToken(token)
  }, [])

  const clearSession = useCallback((status: SessionStatus) => {
    storeToken(null)
    setActiveBranchId(null)
    setState({ ...INITIAL_STATE, status })
  }, [storeToken])

  const applySession = useCallback((session: AuthSessionResponse) => {
    setActiveBranchId(session.context.branch?.id ?? null)
    setState({
      user: session.user,
      organization: {
        id: session.user.organizationId,
        name: session.user.organizationId,
        displayName: session.user.organizationId,
      },
      branch: session.context.branch,
      permissions: [...session.context.permissions],
      roles: [...session.context.roles],
      status: 'authenticated',
    })
  }, [])

  const refreshAccessToken = useCallback(async (): Promise<string> => {
    const refreshed = await authApi.refresh()
    storeToken(refreshed.accessToken)
    return refreshed.accessToken
  }, [storeToken])

  useEffect(() => configureApiRuntime({
    getAccessToken: () => tokenRef.current,
    getBranchId: getActiveBranchId,
    refreshAccessToken,
    onSessionExpired: () => clearSession('expired'),
    onForbidden: () => setState((current) => ({ ...current, status: 'forbidden' })),
  }), [clearSession, refreshAccessToken])

  useEffect(() => {
    let active = true

    bootstrapPromiseRef.current ??= (async () => {
      const refreshed = await authApi.refresh()
      tokenRef.current = refreshed.accessToken
      const session = await authApi.me()
      return { token: refreshed.accessToken, session }
    })()

    void bootstrapPromiseRef.current
      .then(({ token, session }) => {
        if (!active) return
        storeToken(token)
        applySession(session)
      })
      .catch(() => {
        if (active) clearSession('unauthenticated')
      })

    return () => { active = false }
  }, [applySession, clearSession, storeToken])

  const login = useCallback(async (credentials: LoginCredentials) => {
    setState((current) => ({ ...current, status: 'loading' }))
    setActiveBranchId(null)
    try {
      const result = await authApi.login(credentials)
      storeToken(result.accessToken)
      const session = await authApi.me()
      applySession(session)
    } catch (error) {
      clearSession('unauthenticated')
      throw error
    }
  }, [applySession, clearSession, storeToken])

  const logout = useCallback(async () => {
    try {
      await authApi.logout()
    } finally {
      clearSession('unauthenticated')
    }
  }, [clearSession])

  const refreshSession = useCallback(async () => {
    setState((current) => ({ ...current, status: 'loading' }))
    try {
      await refreshAccessToken()
      applySession(await authApi.me())
    } catch (error) {
      clearSession('expired')
      throw error
    }
  }, [applySession, clearSession, refreshAccessToken])

  const updateAuthorizationContext = useCallback((context: AuthorizationContext & { branch: SessionBranch | null }) => {
    setActiveBranchId(context.branch?.id ?? null)
    setState((current) => ({
      ...current,
      branch: context.branch,
      permissions: [...context.permissions],
      roles: [...context.roles],
      status: 'authenticated',
    }))
  }, [])

  const updateOrganizationContext = useCallback((organization: OrganizationContext) => {
    setState((current) => current.organization
      && current.organization.id === organization.id
      && current.organization.name === organization.name
      && current.organization.displayName === organization.displayName
      ? current
      : { ...current, organization })
  }, [])

  const hasPermission = useCallback(
    (permission: string) => state.permissions.includes(permission),
    [state.permissions],
  )

  const value = useMemo<AuthContextValue>(() => ({
    currentUser: state.user,
    organization: state.organization,
    permissions: state.permissions,
    roles: state.roles,
    currentBranchContext: state.branch,
    sessionStatus: state.status,
    accessToken,
    isAuthenticated: Boolean(state.user && accessToken),
    login,
    logout,
    refreshSession,
    hasPermission,
    updateOrganizationContext,
    updateAuthorizationContext,
    recoverFromForbidden: () => setState((current) => ({
      ...current,
      status: current.user && tokenRef.current ? 'authenticated' : 'unauthenticated',
    })),
  }), [accessToken, hasPermission, login, logout, refreshSession, state, updateAuthorizationContext, updateOrganizationContext])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
