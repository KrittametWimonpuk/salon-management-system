import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { CustomerPolicy, PolicyEngine, type PolicySubject } from '../../src/application/foundation/policy.js'
import { DomainEventFactory, InProcessDomainEventDispatcher } from '../../src/domain/foundation/domain-events.js'
import { success } from '../../src/domain/foundation/result.js'
import { FixedClock } from '../../src/infrastructure/foundation/system-adapters.js'
import { createPrismaRepositories } from '../../src/infrastructure/repositories/prisma-repositories.js'
import { PrismaTransactionManager } from '../../src/infrastructure/transaction/prisma-transaction-manager.js'
import {
  ArchiveCustomer,
  CreateCustomer,
  GetCustomer,
  RestoreCustomer,
  UpdateCustomer,
  type CustomerUseCaseContext,
  type CustomerWriteDependencies,
} from '../../src/modules/customer/customer.use-cases.js'

const databaseUrl = process.env.TEST_DATABASE_URL
const database = databaseUrl ? new PrismaClient({ datasources: { db: { url: databaseUrl } } }) : null
const now = new Date('2026-08-08T00:00:00.000Z')

describe.runIf(database !== null)('Customer PostgreSQL integration', () => {
  let organizationId: string
  let branchId: string
  let otherOrganizationId: string
  let context: CustomerUseCaseContext
  let write: CustomerWriteDependencies

  beforeAll(async () => database!.$connect())

  beforeEach(async () => {
    const testOrganizations = await database!.organization.findMany({
      where: { name: { startsWith: 'Customer Integration' } }, select: { id: true },
    })
    const ids = testOrganizations.map(({ id }) => id)
    if (ids.length) {
      await database!.customerTagAssignment.deleteMany({ where: { customer: { organizationId: { in: ids } } } })
      await database!.customer.deleteMany({ where: { organizationId: { in: ids } } })
      await database!.customerTag.deleteMany({ where: { organizationId: { in: ids } } })
      await database!.branch.deleteMany({ where: { organizationId: { in: ids } } })
      await database!.organization.deleteMany({ where: { id: { in: ids } } })
    }

    const organization = await database!.organization.create({
      data: { name: 'Customer Integration Primary', timezone: 'Asia/Bangkok', currency: 'THB' },
    })
    const branch = await database!.branch.create({
      data: { organizationId: organization.id, code: 'MAIN', name: 'Main', countryCode: 'TH' },
    })
    const other = await database!.organization.create({
      data: { name: 'Customer Integration Other', timezone: 'Asia/Bangkok', currency: 'THB' },
    })
    organizationId = organization.id
    branchId = branch.id
    otherOrganizationId = other.id
    const subject: PolicySubject = {
      userId: randomUUID(),
      organizationId,
      branchIds: new Set([branchId]),
      permissions: new Set([
        'customer.create', 'customer.read', 'customer.update', 'customer.archive',
        'customer.restore', 'customer.tag.manage',
      ]),
    }
    context = { subject, branchId }
    const clock = new FixedClock(now)
    const idsGenerator = { generate: () => randomUUID() }
    write = {
      transactions: new PrismaTransactionManager(database!),
      policyEngine: new PolicyEngine(),
      policy: new CustomerPolicy(),
      eventFactory: new DomainEventFactory(clock, idsGenerator),
      events: new InProcessDomainEventDispatcher(),
      clock,
      ids: idsGenerator,
    }
  })

  afterAll(async () => database!.$disconnect())

  function input(customerNumber: string, phone: string) {
    return { customerNumber, firstName: 'Integration', phone, preferredBranchId: branchId }
  }

  it('creates and updates through transaction-scoped repositories', async () => {
    const created = await new CreateCustomer(write).execute(context, input('CUS-I-001', '081-000-0001'))
    expect(created.ok).toBe(true)
    if (!created.ok) return

    const updated = await new UpdateCustomer(write).execute(context, created.value.id, { firstName: 'Updated' })
    expect(updated).toMatchObject({ ok: true, value: { firstName: 'Updated', phone: '0810000001' } })
  })

  it('rolls back repository writes when the transaction callback fails technically', async () => {
    const manager = new PrismaTransactionManager(database!)
    const id = randomUUID()
    await expect(manager.withTransaction(async ({ customers }) => {
      await customers.create({
        id,
        organizationId,
        preferredBranchId: branchId,
        customerNumber: 'CUS-ROLLBACK',
        firstName: 'Rollback',
        lastName: null,
        phone: '0810000099',
        email: null,
        dateOfBirth: null,
        notes: null,
      })
      throw new Error('technical failure')
    })).rejects.toThrow('technical failure')

    expect(await database!.customer.count({ where: { id } })).toBe(0)
  })

  it('archives and restores without deleting the row', async () => {
    const created = await new CreateCustomer(write).execute(context, input('CUS-I-002', '081-000-0002'))
    if (!created.ok) throw new Error('test setup failed')
    const archived = await new ArchiveCustomer(write).execute(context, created.value.id)

    expect(archived).toMatchObject({ ok: true, value: { status: 'ARCHIVED' } })
    expect(await database!.customer.count({ where: { id: created.value.id } })).toBe(1)
    expect((await database!.customer.findUnique({ where: { id: created.value.id } }))?.deletedAt).not.toBeNull()

    const restored = await new RestoreCustomer(write).execute(context, created.value.id)
    expect(restored).toMatchObject({ ok: true, value: { status: 'ACTIVE' } })
  })

  it('does not reveal a customer through another organization scope', async () => {
    const created = await new CreateCustomer(write).execute(context, input('CUS-I-003', '081-000-0003'))
    if (!created.ok) throw new Error('test setup failed')
    const otherContext: CustomerUseCaseContext = {
      subject: { ...context.subject, organizationId: otherOrganizationId },
    }
    const result = await new GetCustomer({
      repository: createPrismaRepositories(database!).customers,
      policyEngine: new PolicyEngine(),
      policy: new CustomerPolicy(),
    }).execute(otherContext, created.value.id)

    expect(result).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } })
  })

  it('allows only one concurrent create for the same normalized phone', async () => {
    const firstWrite = { ...write, ids: { generate: () => randomUUID() } }
    const secondWrite = { ...write, ids: { generate: () => randomUUID() } }
    const [first, second] = await Promise.all([
      new CreateCustomer(firstWrite).execute(context, input('CUS-I-004', '081-000-0004')),
      new CreateCustomer(secondWrite).execute(context, input('CUS-I-005', '081 000 0004')),
    ])

    expect([first, second].filter((result) => result.ok)).toHaveLength(1)
    const failed = [first, second].find((result) => !result.ok)
    expect(failed?.ok).toBe(false)
    if (failed && !failed.ok) expect(['CONFLICT', 'CONCURRENCY']).toContain(failed.error.code)
    expect(await database!.customer.count({ where: { organizationId, phone: '0810000004', deletedAt: null } })).toBe(1)
  })

  it('commits successful Result values through the transaction manager', async () => {
    const result = await new PrismaTransactionManager(database!).withTransaction(async () => success('ok'))
    expect(result).toEqual({ ok: true, value: 'ok' })
  })
})
