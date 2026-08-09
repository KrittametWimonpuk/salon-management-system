import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { EmployeePolicy, PolicyEngine, type PolicySubject } from '../../src/application/foundation/policy.js'
import { DomainEventFactory, InProcessDomainEventDispatcher } from '../../src/domain/foundation/domain-events.js'
import { FixedClock } from '../../src/infrastructure/foundation/system-adapters.js'
import { createPrismaRepositories } from '../../src/infrastructure/repositories/prisma-repositories.js'
import { PrismaTransactionManager } from '../../src/infrastructure/transaction/prisma-transaction-manager.js'
import { EmployeeOperations, type EmployeeDependencies, type EmployeeUseCaseContext } from '../../src/modules/employee/employee.use-cases.js'

const databaseUrl = process.env.TEST_DATABASE_URL
const database = databaseUrl ? new PrismaClient({ datasources: { db: { url: databaseUrl } } }) : null
const now = new Date('2026-08-08T00:00:00.000Z')

describe.runIf(database !== null)('Employee PostgreSQL integration', () => {
  let organizationId: string
  let otherOrganizationId: string
  let branchId: string
  let secondBranchId: string
  let skillId: string
  let operations: EmployeeOperations

  beforeAll(async () => database!.$connect())
  beforeEach(async () => {
    const organizations = await database!.organization.findMany({
      where: { name: { startsWith: 'Employee Integration' } }, select: { id: true },
    })
    const ids = organizations.map(({ id }) => id)
    if (ids.length) {
      await database!.workingHour.deleteMany({ where: { employeeBranch: { employee: { organizationId: { in: ids } } } } })
      await database!.employeeTimeOff.deleteMany({ where: { employee: { organizationId: { in: ids } } } })
      await database!.employeeSkill.deleteMany({ where: { employee: { organizationId: { in: ids } } } })
      await database!.employeeBranch.deleteMany({ where: { employee: { organizationId: { in: ids } } } })
      await database!.employee.deleteMany({ where: { organizationId: { in: ids } } })
      await database!.skill.deleteMany({ where: { organizationId: { in: ids } } })
      await database!.branch.deleteMany({ where: { organizationId: { in: ids } } })
      await database!.organization.deleteMany({ where: { id: { in: ids } } })
    }
    const organization = await database!.organization.create({
      data: { name: 'Employee Integration Primary', timezone: 'Asia/Bangkok', currency: 'THB' },
    })
    const other = await database!.organization.create({
      data: { name: 'Employee Integration Other', timezone: 'Asia/Bangkok', currency: 'THB' },
    })
    const branch = await database!.branch.create({
      data: { organizationId: organization.id, code: 'MAIN', name: 'Main', countryCode: 'TH' },
    })
    const second = await database!.branch.create({
      data: { organizationId: organization.id, code: 'SECOND', name: 'Second', countryCode: 'TH' },
    })
    const skill = await database!.skill.create({ data: { organizationId: organization.id, name: 'Hair Color' } })
    organizationId = organization.id
    otherOrganizationId = other.id
    branchId = branch.id
    secondBranchId = second.id
    skillId = skill.id
    const clock = new FixedClock(now)
    const dependencies: EmployeeDependencies = {
      repository: createPrismaRepositories(database!).employees,
      transactions: new PrismaTransactionManager(database!), policyEngine: new PolicyEngine(), policy: new EmployeePolicy(),
      eventFactory: new DomainEventFactory(clock, { generate: randomUUID }),
      events: new InProcessDomainEventDispatcher(), clock, ids: { generate: randomUUID },
    }
    operations = new EmployeeOperations(dependencies)
  })
  afterAll(async () => database!.$disconnect())

  function context(selectedBranch = branchId, organization = organizationId): EmployeeUseCaseContext {
    const subject: PolicySubject = { userId: randomUUID(), organizationId: organization,
      branchIds: new Set([selectedBranch]), permissions: new Set(['employee.create', 'employee.read', 'employee.update',
        'employee.archive', 'employee.restore', 'employee.branch.manage', 'employee.skill.manage', 'employee.schedule.manage']) }
    return { subject, branchId: selectedBranch, organizationWide: true }
  }

  async function createEmployee() {
    const result = await operations.create(context(), { employeeCode: `EMP-${randomUUID().slice(0, 8)}`, displayName: 'Integration Stylist' })
    if (!result.ok) throw new Error(`Employee setup failed: ${result.error.message}`)
    return result.value
  }

  it('creates with one primary branch and updates the employee', async () => {
    const created = await createEmployee()
    expect(created.branches).toMatchObject([{ branchId, isPrimary: true }])
    const updated = await operations.update(context(), created.id, { displayName: 'Updated Stylist' })
    expect(updated).toMatchObject({ ok: true, value: { displayName: 'Updated Stylist' } })
  })

  it('archives/restores with soft delete and enforces tenant and branch isolation', async () => {
    const created = await createEmployee()
    expect(await operations.get(context(secondBranchId), created.id)).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } })
    expect(await operations.get(context(branchId, otherOrganizationId), created.id)).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } })
    expect(await operations.archive(context(), created.id)).toMatchObject({ ok: true, value: { status: 'ARCHIVED' } })
    expect(await database!.employee.count({ where: { id: created.id } })).toBe(1)
    expect(await operations.restore(context(), created.id)).toMatchObject({ ok: true, value: { status: 'ACTIVE' } })
  })

  it('manages multi-branch assignment with exactly one primary branch', async () => {
    const created = await createEmployee()
    expect((await operations.assignBranch(context(secondBranchId), created.id, secondBranchId)).ok).toBe(true)
    expect((await operations.setPrimaryBranch(context(secondBranchId), created.id, secondBranchId)).ok).toBe(true)
    expect(await database!.employeeBranch.count({ where: { employeeId: created.id, isPrimary: true, isActive: true, deletedAt: null } })).toBe(1)
    const removed = await operations.removeBranch(context(branchId), created.id, branchId)
    expect(removed.ok).toBe(true)
  })

  it('assigns an organization skill and prevents overlapping working hours', async () => {
    const created = await createEmployee()
    expect((await operations.assignSkill(context(), created.id, { skillId, proficiencyLevel: 5 })).ok).toBe(true)
    const first = await operations.setWorkingHour(context(), created.id, {
      dayOfWeek: 1, startTime: '09:00:00', endTime: '12:00:00', effectiveFrom: '2026-08-01',
    })
    const overlap = await operations.setWorkingHour(context(), created.id, {
      dayOfWeek: 1, startTime: '11:00:00', endTime: '14:00:00', effectiveFrom: '2026-08-01',
    })
    expect(first.ok).toBe(true)
    expect(overlap).toMatchObject({ ok: false, error: { code: 'CONFLICT' } })
  })

  it('creates and cancels employee time off', async () => {
    const created = await createEmployee()
    const timeOff = await operations.createTimeOff(context(), created.id, {
      branchId, startsAt: '2026-08-10T09:00:00+07:00', endsAt: '2026-08-10T18:00:00+07:00', reason: 'Leave',
    })
    expect(timeOff).toMatchObject({ ok: true, value: { status: 'PENDING' } })
    if (!timeOff.ok) return
    expect(await operations.cancelTimeOff(context(), created.id, timeOff.value.id))
      .toMatchObject({ ok: true, value: { status: 'CANCELLED' } })
  })

  it('rolls back a failed employee transaction', async () => {
    const id = randomUUID()
    const manager = new PrismaTransactionManager(database!)
    await expect(manager.withTransaction(async ({ employees }) => {
      await employees.createWithPrimaryBranch({ id, organizationId, employeeCode: 'EMP-ROLLBACK', displayName: 'Rollback',
        firstName: null, lastName: null, phone: null, email: null, hireDate: null }, branchId, randomUUID())
      throw new Error('technical rollback')
    })).rejects.toThrow('technical rollback')
    expect(await database!.employee.count({ where: { id } })).toBe(0)
  })
})
