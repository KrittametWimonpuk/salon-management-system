import { describe, expect, it } from 'vitest'
import { AppError } from '../../src/shared/errors/app-error.js'
import { TokenService } from '../../src/modules/auth/token.service.js'
import { ids } from '../helpers/fakes.js'
import { testConfig } from '../helpers/config.js'

describe('TokenService', () => {
  it('issues and verifies access claims with strict token type', () => {
    const service = new TokenService(testConfig().jwt)
    const token = service.issueAccessToken({
      userId: ids.user,
      organizationId: ids.organization,
      sessionId: ids.role,
    })
    const claims = service.verifyAccessToken(token)
    expect(claims.sub).toBe(ids.user)
    expect(claims.org).toBe(ids.organization)
    expect(claims.typ).toBe('access')
    expect(() => service.verifyRefreshToken(token)).toThrow(AppError)
  })

  it('produces a stable non-reversible refresh token hash', () => {
    const service = new TokenService(testConfig().jwt)
    const hash = service.hashRefreshToken('refresh-token')
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(hash).toBe(service.hashRefreshToken('refresh-token'))
    expect(hash).not.toContain('refresh-token')
  })
})
