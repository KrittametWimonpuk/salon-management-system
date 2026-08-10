import type { AuthSessionResponse, AuthUser, LoginCredentials } from '../auth/auth.types'
import { apiRequest } from './client'

interface TokenResponse {
  accessToken: string
  tokenType: 'Bearer'
  expiresIn: number
}

interface LoginResponse extends TokenResponse {
  user: AuthUser
}

export const authApi = {
  login(credentials: LoginCredentials): Promise<LoginResponse> {
    return apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
      auth: false,
      branch: false,
      retryOnUnauthorized: false,
    })
  },
  refresh(): Promise<TokenResponse> {
    return apiRequest('/auth/refresh', {
      method: 'POST',
      body: '{}',
      auth: false,
      branch: false,
      retryOnUnauthorized: false,
    })
  },
  me(): Promise<AuthSessionResponse> {
    return apiRequest('/auth/me')
  },
  logout(): Promise<{ loggedOut: true }> {
    return apiRequest('/auth/logout', {
      method: 'POST',
      body: '{}',
      branch: false,
      retryOnUnauthorized: false,
    })
  },
}
