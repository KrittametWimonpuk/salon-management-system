import { describe, expect, it, vi } from 'vitest'
import type { EmployeeRecord, EmployeeRepository } from '../../src/application/foundation/repositories.js'
import { EmployeePolicy, PolicyEngine, type PolicySubject } from '../../src/application/foundation/policy.js'
import type { TransactionManager, TransactionScope } from '../../src/application/foundation/transaction.js'
import { DomainEventFactory, InProcessDomainEventDispatcher } from '../../src/domain/foundation/domain-events.js'
import { success, type Result } from '../../src/domain/foundation/result.js'
import { FixedClock } from '../../src/infrastructure/foundation/system-adapters.js'
import { createTimeOffSchema, workingHourSchema } from '../../src/modules/employee/employee.schemas.js'
import { EmployeeOperations, type EmployeeDependencies, type EmployeeUseCaseContext } from '../../src/modules/employee/employee.use-cases.js'

const organizationId = '10000000-0000-4000-8000-000000000001'
const branchId = '20000000-0000-4000-8000-000000000001'
const employeeId = '30000000-0000-4000-8000-000000000001'
const now = new Date('2026-08-08T00:00:00.000Z')

const employee: EmployeeRecord = {
  id: employeeId, organizationId, userId: null, employeeCode: 'EMP-001', displayName: 'May',
  firstName: 'May', lastName: null, phone: null, email: null, hireDate: null, status: 'ACTIVE',
  employmentStatus: 'ACTIVE', deletedAt: null,
  branches: [{ id: '31000000-0000-4000-8000-000000000001', branchId, branchName: 'Main', isPrimary: true, isActive: true }],
  skills: [], createdAt: now, updatedAt: now,
}

class TestTransactionManager implements TransactionManager {
  calls = 0
  constructor(private readonly repository: EmployeeRepository) {}
  async withTransaction<T, E>(work: (scope: TransactionScope) => Promise<Result<T, E>>) {
    this.calls += 1
    return work({ employees: this.repository } as TransactionScope)
  }
}

function repository(overrides: Partial<EmployeeRepository> = {}): EmployeeRepository {
  return {
    findById: vi.fn().mockResolvedValue(success(employee)),
    findByIdAnyStatus: vi.fn().mockResolvedValue(success({ ...employee, status: 'ARCHIVED', deletedAt: now })),
    findPage: vi.fn().mockResolvedValue({ items: [employee], page: 1, pageSize: 20, totalItems: 1, totalPages: 1 }),
    createWithPrimaryBranch: vi.fn().mockResolvedValue(employee),
    update: vi.fn().mockResolvedValue({ ...employee, displayName: 'Updated' }),
    archive: vi.fn().mockResolvedValue({ ...employee, status: 'ARCHIVED', deletedAt: now }),
    restore: vi.fn().mockResolvedValue(employee),
    branchExists: vi.fn().mockResolvedValue(true),
    assignBranch: vi.fn().mockResolvedValue(true),
    removeBranch: vi.fn().mockResolvedValue(true),
    setPrimaryBranch: vi.fn().mockResolvedValue(true),
    findActiveSkill: vi.fn().mockResolvedValue(true),
    assignSkill: vi.fn().mockResolvedValue(true),
    removeSkill: vi.fn().mockResolvedValue(true),
    findEmployeeBranch: vi.fn().mockResolvedValue({ id: employee.branches[0]!.id, branchId, branchName: 'Main', isPrimary: false, isActive: true }),
    findWorkingHour: vi.fn().mockResolvedValue({ id: 'wh-1', employeeBranchId: employee.branches[0]!.id,
      branchId, dayOfWeek: 1, startTime: '09:00:00', endTime: '18:00:00', effectiveFrom: null, effectiveTo: null, isActive: true }),
    hasWorkingHourOverlap: vi.fn().mockResolvedValue(false),
    createWorkingHour: vi.fn().mockResolvedValue({ id: 'wh-1', employeeBranchId: employee.branches[0]!.id,
      branchId, dayOfWeek: 1, startTime: '09:00:00', endTime: '18:00:00', effectiveFrom: null, effectiveTo: null, isActive: true }),
    updateWorkingHour: vi.fn().mockResolvedValue({ id: 'wh-1', employeeBranchId: employee.branches[0]!.id,
      branchId, dayOfWeek: 1, startTime: '10:00:00', endTime: '18:00:00', effectiveFrom: null, effectiveTo: null, isActive: true }),
    removeWorkingHour: vi.fn().mockResolvedValue(true),
    createTimeOff: vi.fn().mockResolvedValue({ id: 'to-1', employeeId, branchId,
      startsAt: now, endsAt: new Date('2026-08-09T00:00:00.000Z'), status: 'PENDING', reason: null }),
    cancelTimeOff: vi.fn().mockResolvedValue({ id: 'to-1', employeeId, branchId,
      startsAt: now, endsAt: new Date('2026-08-09T00:00:00.000Z'), status: 'CANCELLED', reason: null }),
    ...overrides,
  }
}

function harness(options: { overrides?: Partial<EmployeeRepository>; permissions?: string[]; organizationWide?: boolean } = {}) {
  const repo = repository(options.overrides)
  const transactions = new TestTransactionManager(repo)
  const clock = new FixedClock(now)
  const permissions = options.permissions ?? ['employee.create', 'employee.read', 'employee.update', 'employee.archive',
    'employee.restore', 'employee.branch.manage', 'employee.skill.manage', 'employee.schedule.manage']
  const subject: PolicySubject = { userId: 'user-1', organizationId, branchIds: new Set([branchId]), permissions: new Set(permissions) }
  const context: EmployeeUseCaseContext = { subject, branchId, organizationWide: options.organizationWide ?? true }
  const dependencies: EmployeeDependencies = { repository: repo, transactions, policyEngine: new PolicyEngine(),
    policy: new EmployeePolicy(), clock, ids: { generate: () => '50000000-0000-4000-8000-000000000001' },
    eventFactory: new DomainEventFactory(clock, { generate: () => 'event-1' }), events: new InProcessDomainEventDispatcher() }
  return { operations: new EmployeeOperations(dependencies), repo, transactions, context }
}

describe('Employee use cases', () => {
  it('creates with a primary branch and updates through transactions', async () => {
    const test = harness()
    const created = await test.operations.create(test.context, { employeeCode: 'EMP-001', displayName: 'May' })
    const updated = await test.operations.update(test.context, employeeId, { displayName: 'Updated' })
    expect(created).toMatchObject({ ok: true, value: { branches: [{ isPrimary: true }] } })
    expect(updated).toMatchObject({ ok: true, value: { displayName: 'Updated' } })
    expect(test.transactions.calls).toBe(2)
  })

  it('archives and restores without deleting associations', async () => {
    const test = harness()
    expect(await test.operations.archive(test.context, employeeId)).toMatchObject({ ok: true, value: { status: 'ARCHIVED' } })
    expect(await test.operations.restore(test.context, employeeId)).toMatchObject({ ok: true, value: { status: 'ACTIVE' } })
  })

  it('assigns/removes branches and enforces primary branch replacement', async () => {
    const test = harness()
    expect((await test.operations.assignBranch(test.context, employeeId, branchId)).ok).toBe(true)
    expect((await test.operations.removeBranch(test.context, employeeId, branchId)).ok).toBe(true)
    expect((await test.operations.setPrimaryBranch(test.context, employeeId, branchId)).ok).toBe(true)

    const primary = harness({ overrides: { findEmployeeBranch: vi.fn().mockResolvedValue({
      id: 'assignment', branchId, branchName: 'Main', isPrimary: true, isActive: true,
    }) } })
    expect(await primary.operations.removeBranch(primary.context, employeeId, branchId))
      .toMatchObject({ ok: false, error: { code: 'BUSINESS_RULE_VIOLATION' } })
  })

  it('assigns and removes existing organization skills', async () => {
    const test = harness()
    const skillId = '40000000-0000-4000-8000-000000000001'
    expect((await test.operations.assignSkill(test.context, employeeId, { skillId, proficiencyLevel: 4 })).ok).toBe(true)
    expect((await test.operations.removeSkill(test.context, employeeId, skillId)).ok).toBe(true)
  })

  it('prevents overlapping working hours', async () => {
    const test = harness({ overrides: { hasWorkingHourOverlap: vi.fn().mockResolvedValue(true) } })
    expect(await test.operations.setWorkingHour(test.context, employeeId, {
      dayOfWeek: 1, startTime: '09:00:00', endTime: '18:00:00',
    })).toMatchObject({ ok: false, error: { code: 'CONFLICT' } })
  })

  it('creates and cancels time off while restricting organization-wide leave', async () => {
    const test = harness()
    const created = await test.operations.createTimeOff(test.context, employeeId, {
      branchId, startsAt: '2026-08-08T00:00:00+07:00', endsAt: '2026-08-09T00:00:00+07:00',
    })
    const cancelled = await test.operations.cancelTimeOff(test.context, employeeId, 'to-1')
    expect(created).toMatchObject({ ok: true, value: { status: 'PENDING' } })
    expect(cancelled).toMatchObject({ ok: true, value: { status: 'CANCELLED' } })

    const branchOnly = harness({ organizationWide: false })
    expect(await branchOnly.operations.createTimeOff(branchOnly.context, employeeId, {
      branchId: null, startsAt: '2026-08-08T00:00:00+07:00', endsAt: '2026-08-09T00:00:00+07:00',
    })).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } })
  })

  it('returns policy and branch isolation failures', async () => {
    const denied = harness({ permissions: [] })
    expect(await denied.operations.get(denied.context, employeeId)).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } })
    const test = harness()
    expect(await test.operations.list(test.context, { status: 'ACTIVE', branchId: 'other', page: 1, pageSize: 20,
      sort: 'createdAt', order: 'desc' })).toMatchObject({ ok: false, error: { code: 'TENANT_ISOLATION' } })
  })

  it('validates time ranges before business execution', () => {
    expect(workingHourSchema.safeParse({ dayOfWeek: 1, startTime: '18:00:00', endTime: '09:00:00' }).success).toBe(false)
    expect(createTimeOffSchema.safeParse({ startsAt: '2026-08-09T00:00:00Z', endsAt: '2026-08-08T00:00:00Z' }).success).toBe(false)
  })
})
