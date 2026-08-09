import { describe, expect, it } from 'vitest'
import { AuthService } from '../../src/modules/auth/auth.service.js'
import type { PasswordService } from '../../src/modules/auth/password.service.js'
import { TokenService } from '../../src/modules/auth/token.service.js'
import { AppError } from '../../src/shared/errors/app-error.js'
import { ErrorCode } from '../../src/shared/errors/error-codes.js'
import { testConfig } from '../helpers/config.js'
import { FakeAuthStore, ids } from '../helpers/fakes.js'

const passwords: PasswordService = {
  async verify(plainText, passwordHash) {
    return plainText === 'correct-password' && passwordHash === 'valid-hash'
  },
}

function subject(): { service: AuthService; store: FakeAuthStore } {
  const config = testConfig()
  const store = new FakeAuthStore()
  return {
    store,
    service: new AuthService(store, passwords, new TokenService(config.jwt), config.jwt),
  }
}

describe('AuthService', () => {
  it('rejects invalid credentials without revealing which field failed', async () => {
    const { service } = subject()
    await expect(service.login({
      organizationId: ids.organization,
      email: 'owner@example.test',
      password: 'wrong-password',
    })).rejects.toMatchObject({ code: ErrorCode.AUTH_INVALID_CREDENTIALS })
  })

  it('rotates refresh tokens and revokes the family when an old token is reused', async () => {
    const { service, store } = subject()
    const login = await service.login({
      organizationId: ids.organization,
      email: 'owner@example.test',
      password: 'correct-password',
    })
    const rotated = await service.refresh(login.refreshToken)
    expect(rotated.refreshToken).not.toBe(login.refreshToken)

    let reuseError: unknown
    try {
      await service.refresh(login.refreshToken)
    } catch (error) {
      reuseError = error
    }
    expect(reuseError).toBeInstanceOf(AppError)
    expect(reuseError).toMatchObject({ code: ErrorCode.AUTH_TOKEN_REUSED })
    expect([...store.sessions.values()].every((session) => session.revoked)).toBe(true)
  })
})
