import type { AppConfig } from '../../src/config/env.js'

export function testConfig(): AppConfig {
  return {
    nodeEnv: 'test',
    port: 4000,
    jwt: {
      accessSecret: 'access-secret-for-tests-only-000000000000000000000000',
      refreshSecret: 'refresh-secret-for-tests-only-00000000000000000000000',
      issuer: 'salon-api-test',
      audience: 'salon-web-test',
      accessTtlSeconds: 900,
      refreshTtlSeconds: 86_400,
    },
    corsOrigins: new Set(['https://salon.example.test']),
    cookie: { secure: false, sameSite: 'strict', name: 'salon_refresh' },
    trustProxy: 0,
    requestBodyLimit: '100kb',
    rateLimit: { windowMs: 60_000, apiMax: 1_000, authMax: 1_000 },
    featureFlags: {},
  }
}
