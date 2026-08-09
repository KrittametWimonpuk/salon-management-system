import { describe, expect, it, vi } from 'vitest'
import { PrismaCustomerRepository } from '../../src/infrastructure/repositories/prisma-repositories.js'

describe('Prisma repositories', () => {
  it('always adds tenant and soft-delete predicates', async () => {
    const findFirst = vi.fn().mockResolvedValue(null)
    const repository = new PrismaCustomerRepository({ customer: { findFirst } } as never)

    const result = await repository.findById({ organizationId: 'org-1' }, 'customer-1')

    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'customer-1', organizationId: 'org-1', deletedAt: null },
    }))
    expect(result).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } })
  })

  it('returns a tenant-scoped record as a Result', async () => {
    const record = {
      id: 'customer-1', organizationId: 'org-1', preferredBranchId: null,
      customerNumber: 'C-1', firstName: 'Ada', lastName: null, phone: null,
      email: null, dateOfBirth: null, notes: null, lastVisitAt: null, deletedAt: null,
      tags: [], createdAt: new Date(), updatedAt: new Date(),
    }
    const repository = new PrismaCustomerRepository({
      customer: { findFirst: vi.fn().mockResolvedValue(record) },
    } as never)

    await expect(repository.findById({ organizationId: 'org-1' }, 'customer-1'))
      .resolves.toEqual({ ok: true, value: { ...record, status: 'ACTIVE' } })
  })
})
