import { describe, expect, it } from 'vitest'
import { BookingPolicy, PolicyEngine, type PolicySubject } from '../../src/application/foundation/policy.js'

const subject: PolicySubject = {
  userId: 'user-1',
  organizationId: 'org-1',
  branchIds: new Set(['branch-1']),
  permissions: new Set(['booking.read']),
}

describe('PolicyEngine', () => {
  const engine = new PolicyEngine()
  const policy = new BookingPolicy()

  it('combines permission, organization, and branch scope', () => {
    const result = engine.authorize(policy, subject, { permission: 'booking.read' }, {
      organizationId: 'org-1', branchId: 'branch-1', ownerId: null,
    })

    expect(result.ok).toBe(true)
  })

  it('rejects cross-organization resources before checking RBAC', () => {
    const result = engine.authorize(policy, subject, { permission: 'booking.read' }, {
      organizationId: 'org-2', branchId: 'branch-1', ownerId: null,
    })

    expect(result).toMatchObject({ ok: false, error: { code: 'TENANT_ISOLATION' } })
  })

  it('allows an owner only when the action explicitly opts in', () => {
    const result = engine.authorize(policy, subject, { permission: 'booking.update', allowOwner: true }, {
      organizationId: 'org-1', branchId: 'branch-1', ownerId: 'user-1',
    })

    expect(result.ok).toBe(true)
  })

  it('rejects missing permissions', () => {
    const result = engine.authorize(policy, subject, { permission: 'booking.update' }, {
      organizationId: 'org-1', branchId: 'branch-1', ownerId: 'user-1',
    })

    expect(result).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } })
  })
})

