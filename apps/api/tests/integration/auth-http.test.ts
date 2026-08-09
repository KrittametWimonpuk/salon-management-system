import request from 'supertest'
import { z } from 'zod'
import { beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../../src/app.js'
import { AuthService } from '../../src/modules/auth/auth.service.js'
import type { PasswordService } from '../../src/modules/auth/password.service.js'
import { TokenService } from '../../src/modules/auth/token.service.js'
import { TenantService } from '../../src/modules/tenant/tenant.service.js'
import type { AuditEntry, AuditSink } from '../../src/shared/audit/audit.js'
import { ErrorCode } from '../../src/shared/errors/error-codes.js'
import { testConfig } from '../helpers/config.js'
import { FakeAuthStore, FakeTenantStore, ids } from '../helpers/fakes.js'

const successSchema = z.object({
  success: z.literal(true),
  data: z.object({
    accessToken: z.string(),
    tokenType: z.literal('Bearer'),
    expiresIn: z.number(),
  }).passthrough(),
  meta: z.record(z.unknown()),
})

const errorSchema = z.object({
  success: z.literal(false),
  error: z.object({ code: z.string(), message: z.string(), details: z.array(z.unknown()) }),
})

class CapturingAuditSink implements AuditSink {
  readonly entries: AuditEntry[] = []
  async record(entry: AuditEntry): Promise<void> {
    this.entries.push(entry)
  }
}

const passwords: PasswordService = {
  async verify(plainText, passwordHash) {
    return plainText === 'correct-password' && passwordHash === 'valid-hash'
  },
}

function setup() {
  const config = testConfig()
  const store = new FakeAuthStore()
  const authService = new AuthService(store, passwords, new TokenService(config.jwt), config.jwt)
  const auditSink = new CapturingAuditSink()
  const app = createApp({
    config,
    authService,
    tenantService: new TenantService(new FakeTenantStore()),
    auditSink,
  })
  return { app, store, auditSink }
}

async function login(agent: request.Agent) {
  return agent.post('/api/auth/login').send({
    organizationId: ids.organization,
    email: 'owner@example.test',
    password: 'correct-password',
  })
}

describe('authentication HTTP pipeline', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'test'
  })

  it('logs in, sets an HttpOnly refresh cookie, and resolves current branch context', async () => {
    const { app } = setup()
    const agent = request.agent(app)
    const loginResponse = await login(agent)
    expect(loginResponse.status).toBe(200)
    expect(loginResponse.headers['set-cookie']).toEqual(expect.arrayContaining([
      expect.stringContaining('HttpOnly'),
    ]))
    const loginBody = successSchema.parse(loginResponse.body)

    const meResponse = await agent
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${loginBody.data.accessToken}`)
    expect(meResponse.status).toBe(200)
    expect(meResponse.body).toMatchObject({
      success: true,
      data: {
        user: { organizationId: ids.organization },
        context: { branch: { id: ids.branch }, permissions: ['booking.read', 'setting.manage'] },
      },
    })
  })

  it('returns standardized unauthorized and cross-tenant branch errors', async () => {
    const { app } = setup()
    const unauthorized = await request(app).get('/api/auth/me')
    expect(errorSchema.parse(unauthorized.body).error.code).toBe(ErrorCode.AUTH_TOKEN_INVALID)

    const agent = request.agent(app)
    const loginBody = successSchema.parse((await login(agent)).body)
    const forbidden = await agent
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${loginBody.data.accessToken}`)
      .set('X-Branch-ID', ids.otherBranch)
    expect(forbidden.status).toBe(403)
    expect(errorSchema.parse(forbidden.body).error.code).toBe(ErrorCode.TENANT_BRANCH_FORBIDDEN)
  })

  it('rotates refresh tokens and detects reuse of the previous cookie', async () => {
    const { app, store } = setup()
    const agent = request.agent(app)
    const loginResponse = await login(agent)
    const cookies = z.array(z.string()).parse(loginResponse.headers['set-cookie'])
    const oldRefreshCookie = cookies[0]!.split(';')[0]!

    const refreshResponse = await agent.post('/api/auth/refresh').send({})
    expect(refreshResponse.status).toBe(200)
    expect(successSchema.parse(refreshResponse.body).data.accessToken).toBeTruthy()

    const reuseResponse = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', oldRefreshCookie)
      .send({})
    expect(reuseResponse.status).toBe(401)
    expect(errorSchema.parse(reuseResponse.body).error.code).toBe(ErrorCode.AUTH_TOKEN_REUSED)
    expect([...store.sessions.values()].every((session) => session.revoked)).toBe(true)
  })

  it('revokes the access-token session on logout', async () => {
    const { app } = setup()
    const agent = request.agent(app)
    const loginBody = successSchema.parse((await login(agent)).body)
    const authorization = `Bearer ${loginBody.data.accessToken}`

    const logoutResponse = await agent.post('/api/auth/logout').set('Authorization', authorization).send({})
    expect(logoutResponse.status).toBe(200)

    const meResponse = await agent.get('/api/auth/me').set('Authorization', authorization)
    expect(meResponse.status).toBe(401)
    expect(errorSchema.parse(meResponse.body).error.code).toBe(ErrorCode.AUTH_SESSION_REVOKED)
  })
})
