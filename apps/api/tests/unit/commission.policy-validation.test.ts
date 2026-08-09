import { describe, expect, it } from 'vitest'
import { CommissionPolicy, PolicyEngine } from '../../src/application/foundation/policy.js'
import { optionalPeriodSchema, reasonedPeriodSchema } from '../../src/modules/commission/commission.schemas.js'

describe('Commission policy and validation', () => {
  it('denies a commission action when the permission is missing', () => {
    const result = new PolicyEngine().authorize(new CommissionPolicy(), {
      userId: 'user', organizationId: 'organization', branchIds: new Set(['branch']), permissions: new Set(),
    }, { permission: 'commission.calculate' }, { organizationId: 'organization', branchId: 'branch', ownerId: null })
    expect(result).toMatchObject({ ok: false, error: { code: 'FORBIDDEN', details: { permission: 'commission.calculate' } } })
  })

  it('rejects incomplete periods and missing financial audit reasons', () => {
    expect(optionalPeriodSchema.safeParse({ dateFrom: '2026-08-01T00:00:00.000Z' }).success).toBe(false)
    expect(reasonedPeriodSchema.safeParse({ dateFrom: '2026-09-01T00:00:00.000Z',
      dateTo: '2026-08-01T00:00:00.000Z', reason: '' }).success).toBe(false)
  })
})
