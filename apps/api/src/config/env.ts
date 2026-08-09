import { z } from 'zod'

const booleanFromString = z.preprocess((value) => {
  if (typeof value !== 'string') return value
  return value.toLowerCase() === 'true'
}, z.boolean())

const featureFlagsFromJson = z.preprocess((value) => {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value) as unknown
  } catch {
    return value
  }
}, z.record(z.boolean()))

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DATABASE_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ISSUER: z.string().min(1).default('salon-api'),
  JWT_AUDIENCE: z.string().min(1).default('salon-web'),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
  JWT_REFRESH_TTL_SECONDS: z.coerce.number().int().min(3600).max(31_536_000).default(2_592_000),
  CORS_ORIGINS: z.string().min(1),
  COOKIE_SECURE: booleanFromString.default(true),
  COOKIE_SAME_SITE: z.enum(['strict', 'lax', 'none']).default('strict'),
  TRUST_PROXY: z.coerce.number().int().min(0).max(10).default(1),
  REQUEST_BODY_LIMIT: z.string().min(1).default('100kb'),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  API_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),
  FEATURE_FLAGS: featureFlagsFromJson.default({}),
})

export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production'
  port: number
  jwt: {
    accessSecret: string
    refreshSecret: string
    issuer: string
    audience: string
    accessTtlSeconds: number
    refreshTtlSeconds: number
  }
  corsOrigins: ReadonlySet<string>
  cookie: {
    secure: boolean
    sameSite: 'strict' | 'lax' | 'none'
    name: string
  }
  trustProxy: number
  requestBodyLimit: string
  rateLimit: {
    windowMs: number
    apiMax: number
    authMax: number
  }
  featureFlags: Readonly<Record<string, boolean>>
}

export function loadConfig(environment: NodeJS.ProcessEnv): AppConfig {
  const parsed = envSchema.parse(environment)
  if (parsed.JWT_ACCESS_SECRET === parsed.JWT_REFRESH_SECRET) {
    throw new Error('JWT access and refresh secrets must be different')
  }
  if (parsed.COOKIE_SAME_SITE === 'none' && !parsed.COOKIE_SECURE) {
    throw new Error('SameSite=None cookies require COOKIE_SECURE=true')
  }

  return {
    nodeEnv: parsed.NODE_ENV,
    port: parsed.PORT,
    jwt: {
      accessSecret: parsed.JWT_ACCESS_SECRET,
      refreshSecret: parsed.JWT_REFRESH_SECRET,
      issuer: parsed.JWT_ISSUER,
      audience: parsed.JWT_AUDIENCE,
      accessTtlSeconds: parsed.JWT_ACCESS_TTL_SECONDS,
      refreshTtlSeconds: parsed.JWT_REFRESH_TTL_SECONDS,
    },
    corsOrigins: new Set(parsed.CORS_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean)),
    cookie: {
      secure: parsed.COOKIE_SECURE,
      sameSite: parsed.COOKIE_SAME_SITE,
      name: 'salon_refresh',
    },
    trustProxy: parsed.TRUST_PROXY,
    requestBodyLimit: parsed.REQUEST_BODY_LIMIT,
    rateLimit: {
      windowMs: parsed.RATE_LIMIT_WINDOW_MS,
      apiMax: parsed.API_RATE_LIMIT_MAX,
      authMax: parsed.AUTH_RATE_LIMIT_MAX,
    },
    featureFlags: parsed.FEATURE_FLAGS,
  }
}
