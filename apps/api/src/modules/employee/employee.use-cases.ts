import type {
  EmployeeListQuery, EmployeeRecord, EmployeeRepository, TenantScope,
  UpdateEmployeeData, UpdateWorkingHourData, WorkingHourData,
} from '../../application/foundation/repositories.js'
import type { PageResult } from '../../application/foundation/query.js'
import type { EmployeePolicy, PolicyEngine, PolicySubject } from '../../application/foundation/policy.js'
import type { TransactionManager } from '../../application/foundation/transaction.js'
import { BusinessRuleViolationError, ConflictError, ForbiddenError, NotFoundError,
  TenantIsolationError, type DomainError } from '../../domain/foundation/domain-errors.js'
import type { DomainEventFactory, DomainEventPublisher } from '../../domain/foundation/domain-events.js'
import type { IdGenerator } from '../../domain/foundation/id-generator.js'
import { failure, success, type Result } from '../../domain/foundation/result.js'
import type { Clock } from '../../domain/foundation/time.js'
import { EmployeeEventName } from './employee.events.js'
import type { AssignSkillRequest, CreateEmployeeRequest, CreateTimeOffRequest,
  UpdateEmployeeRequest, UpdateWorkingHourRequest, WorkingHourRequest } from './employee.schemas.js'

export interface EmployeeUseCaseContext {
  subject: PolicySubject
  branchId: string
  organizationWide: boolean
}

export interface EmployeeDependencies {
  repository: EmployeeRepository
  transactions: TransactionManager
  policyEngine: PolicyEngine
  policy: EmployeePolicy
  eventFactory: DomainEventFactory
  events: DomainEventPublisher
  clock: Clock
  ids: IdGenerator
}

export class EmployeeOperations {
  constructor(private readonly dependencies: EmployeeDependencies) {}

  async create(context: EmployeeUseCaseContext, input: CreateEmployeeRequest) {
    const allowed = this.authorize(context, 'employee.create', context.branchId)
    if (!allowed.ok) return allowed
    const result = await this.dependencies.transactions.withTransaction(async ({ employees }) => {
      if (!await employees.branchExists(this.scope(context), context.branchId)) {
        return failure(new TenantIsolationError('Branch is not available in this organization'))
      }
      return success(await employees.createWithPrimaryBranch({
        id: this.dependencies.ids.generate(), organizationId: context.subject.organizationId,
        employeeCode: input.employeeCode, displayName: input.displayName, firstName: input.firstName ?? null,
        lastName: input.lastName ?? null, phone: input.phone ?? null, email: input.email ?? null,
        hireDate: input.hireDate ?? null,
      }, context.branchId, this.dependencies.ids.generate()))
    })
    return this.publish(result, EmployeeEventName.CREATED, result.ok ? result.value.id : '', { branchId: context.branchId })
  }

  async update(context: EmployeeUseCaseContext, id: string, input: UpdateEmployeeRequest) {
    return this.employeeWrite(context, id, 'employee.update', EmployeeEventName.UPDATED, async (employees) => {
      const data: UpdateEmployeeData = {
        ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
        ...(input.firstName !== undefined ? { firstName: input.firstName } : {}),
        ...(input.lastName !== undefined ? { lastName: input.lastName } : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
        ...(input.email !== undefined ? { email: input.email } : {}),
        ...(input.hireDate !== undefined ? { hireDate: input.hireDate } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
      }
      const updated = await employees.update(this.scope(context), id, data)
      return updated ? success(updated) : failure(new NotFoundError('Employee was not found'))
    }, { changedFields: Object.keys(input) })
  }

  async get(context: EmployeeUseCaseContext, id: string): Promise<Result<EmployeeRecord, DomainError>> {
    const allowed = this.authorize(context, 'employee.read', context.branchId)
    return allowed.ok ? this.dependencies.repository.findById(this.scope(context), id) : allowed
  }

  async list(context: EmployeeUseCaseContext, query: EmployeeListQuery): Promise<Result<PageResult<EmployeeRecord>, DomainError>> {
    const allowed = this.authorize(context, 'employee.read', context.branchId)
    if (!allowed.ok) return allowed
    if (query.branchId && query.branchId !== context.branchId) {
      return failure(new TenantIsolationError('Requested branch must match branch context'))
    }
    return success(await this.dependencies.repository.findPage(this.scope(context), { ...query, branchId: context.branchId }))
  }

  async archive(context: EmployeeUseCaseContext, id: string) {
    return this.employeeWrite(context, id, 'employee.archive', EmployeeEventName.ARCHIVED, async (employees) => {
      const value = await employees.archive(this.scope(context), id, this.dependencies.clock.utc())
      return value ? success(value) : failure(new ConflictError('Employee is already archived'))
    })
  }

  async restore(context: EmployeeUseCaseContext, id: string) {
    const tenant = this.scope(context)
    const result = await this.dependencies.transactions.withTransaction(async ({ employees }) => {
      const employee = await employees.findByIdAnyStatus(tenant, id)
      if (!employee.ok) return employee
      const allowed = this.authorize(context, 'employee.restore', context.branchId)
      if (!allowed.ok) return allowed
      if (employee.value.status !== 'ARCHIVED') return failure(new BusinessRuleViolationError('Employee is not archived'))
      const restored = await employees.restore(tenant, id)
      return restored ? success(restored) : failure(new ConflictError('Employee could not be restored'))
    })
    return this.publish(result, EmployeeEventName.RESTORED, id, {})
  }

  async assignBranch(context: EmployeeUseCaseContext, id: string, branchId: string) {
    const branch = this.requireBranch(context, branchId)
    if (!branch.ok) return branch
    const result = await this.dependencies.transactions.withTransaction(async ({ employees }) => {
      const employee = await employees.findById({ organizationId: context.subject.organizationId }, id)
      if (!employee.ok) return employee
      const allowed = this.authorize(context, 'employee.branch.manage', branchId)
      if (!allowed.ok) return allowed
      if (!await employees.branchExists(this.scope(context), branchId)) return failure(new NotFoundError('Branch was not found'))
      if (!await employees.assignBranch(this.scope(context), id, branchId, this.dependencies.ids.generate())) {
        return failure(new ConflictError('Employee is already assigned to branch'))
      }
      return employees.findById(this.scope(context), id)
    })
    return this.publish(result, EmployeeEventName.BRANCH_ASSIGNED, id, { branchId })
  }

  async removeBranch(context: EmployeeUseCaseContext, id: string, branchId: string) {
    const branch = this.requireBranch(context, branchId)
    if (!branch.ok) return branch
    return this.employeeWrite(context, id, 'employee.branch.manage', EmployeeEventName.BRANCH_REMOVED, async (employees) => {
      const assignment = await employees.findEmployeeBranch(this.scope(context), id, branchId)
      if (!assignment) return failure(new NotFoundError('Employee branch assignment was not found'))
      if (assignment.isPrimary) return failure(new BusinessRuleViolationError('Set another primary branch before removal'))
      if (!await employees.removeBranch(this.scope(context), id, branchId, this.dependencies.clock.utc())) {
        return failure(new ConflictError('Employee branch could not be removed'))
      }
      return employees.findById({ organizationId: context.subject.organizationId }, id)
    }, { branchId })
  }

  async setPrimaryBranch(context: EmployeeUseCaseContext, id: string, branchId: string) {
    const branch = this.requireBranch(context, branchId)
    if (!branch.ok) return branch
    return this.employeeWrite(context, id, 'employee.branch.manage', EmployeeEventName.PRIMARY_BRANCH_CHANGED, async (employees) => {
      if (!await employees.setPrimaryBranch(this.scope(context), id, branchId)) {
        return failure(new NotFoundError('Active employee branch assignment was not found'))
      }
      return employees.findById(this.scope(context), id)
    }, { branchId })
  }

  async assignSkill(context: EmployeeUseCaseContext, id: string, input: AssignSkillRequest) {
    return this.employeeWrite(context, id, 'employee.skill.manage', EmployeeEventName.SKILL_ASSIGNED, async (employees) => {
      if (!await employees.findActiveSkill(this.scope(context), input.skillId)) return failure(new NotFoundError('Skill was not found'))
      if (!await employees.assignSkill(this.scope(context), id, {
        id: this.dependencies.ids.generate(), skillId: input.skillId,
        proficiencyLevel: input.proficiencyLevel ?? null, certifiedAt: input.certifiedAt ?? null,
        expiresAt: input.expiresAt ?? null, notes: input.notes ?? null,
      })) return failure(new ConflictError('Employee skill is already assigned'))
      return employees.findById(this.scope(context), id)
    }, { skillId: input.skillId })
  }

  async removeSkill(context: EmployeeUseCaseContext, id: string, skillId: string) {
    return this.employeeWrite(context, id, 'employee.skill.manage', EmployeeEventName.SKILL_REMOVED, async (employees) => {
      if (!await employees.removeSkill(this.scope(context), id, skillId, this.dependencies.clock.utc())) {
        return failure(new NotFoundError('Employee skill assignment was not found'))
      }
      return employees.findById(this.scope(context), id)
    }, { skillId })
  }

  async setWorkingHour(context: EmployeeUseCaseContext, id: string, input: WorkingHourRequest) {
    return this.employeeWrite(context, id, 'employee.schedule.manage', EmployeeEventName.WORKING_HOUR_SET, async (employees) => {
      const assignment = await employees.findEmployeeBranch(this.scope(context), id, context.branchId)
      if (!assignment) return failure(new BusinessRuleViolationError('Employee is not assigned to branch'))
      const data: WorkingHourData = { id: this.dependencies.ids.generate(), employeeBranchId: assignment.id,
        dayOfWeek: input.dayOfWeek, startTime: input.startTime, endTime: input.endTime,
        effectiveFrom: input.effectiveFrom ?? null, effectiveTo: input.effectiveTo ?? null }
      if (await employees.hasWorkingHourOverlap(this.scope(context), id, data)) {
        return failure(new ConflictError('Working hour overlaps an active schedule'))
      }
      const value = await employees.createWorkingHour(this.scope(context), id, data)
      return value ? success(value) : failure(new NotFoundError('Employee branch assignment was not found'))
    }, {})
  }

  async updateWorkingHour(context: EmployeeUseCaseContext, id: string, workingHourId: string, input: UpdateWorkingHourRequest) {
    return this.scheduleWrite(context, id, EmployeeEventName.WORKING_HOUR_SET, async (employees) => {
      const existing = await employees.findWorkingHour(this.scope(context), id, workingHourId)
      if (!existing) return failure(new NotFoundError('Working hour was not found'))
      const data: UpdateWorkingHourData = {
        ...(input.dayOfWeek !== undefined ? { dayOfWeek: input.dayOfWeek } : {}),
        ...(input.startTime !== undefined ? { startTime: input.startTime } : {}),
        ...(input.endTime !== undefined ? { endTime: input.endTime } : {}),
        ...(input.effectiveFrom !== undefined ? { effectiveFrom: input.effectiveFrom } : {}),
        ...(input.effectiveTo !== undefined ? { effectiveTo: input.effectiveTo } : {}),
      }
      const merged: WorkingHourData = { id: workingHourId, employeeBranchId: existing.employeeBranchId,
        dayOfWeek: input.dayOfWeek ?? existing.dayOfWeek, startTime: input.startTime ?? existing.startTime,
        endTime: input.endTime ?? existing.endTime,
        effectiveFrom: input.effectiveFrom !== undefined ? input.effectiveFrom : existing.effectiveFrom?.toISOString().slice(0, 10) ?? null,
        effectiveTo: input.effectiveTo !== undefined ? input.effectiveTo : existing.effectiveTo?.toISOString().slice(0, 10) ?? null }
      if (merged.endTime <= merged.startTime) return failure(new BusinessRuleViolationError('endTime must be after startTime'))
      if (merged.effectiveFrom && merged.effectiveTo && merged.effectiveTo < merged.effectiveFrom) {
        return failure(new BusinessRuleViolationError('effectiveTo must not be before effectiveFrom'))
      }
      if (await employees.hasWorkingHourOverlap(this.scope(context), id, merged, workingHourId)) {
        return failure(new ConflictError('Working hour overlaps an active schedule'))
      }
      const value = await employees.updateWorkingHour(this.scope(context), id, workingHourId, data)
      return value ? success(value) : failure(new NotFoundError('Working hour was not found'))
    }, { workingHourId })
  }

  async removeWorkingHour(context: EmployeeUseCaseContext, id: string, workingHourId: string) {
    return this.scheduleWrite(context, id, EmployeeEventName.WORKING_HOUR_REMOVED, async (employees) => {
      if (!await employees.removeWorkingHour(this.scope(context), id, workingHourId, this.dependencies.clock.utc())) {
        return failure(new NotFoundError('Working hour was not found'))
      }
      return success({ id: workingHourId })
    }, { workingHourId })
  }

  async createTimeOff(context: EmployeeUseCaseContext, id: string, input: CreateTimeOffRequest) {
    const branchId = input.branchId ?? null
    if (branchId && branchId !== context.branchId) return failure(new TenantIsolationError('Time off branch must match branch context'))
    if (!branchId && !context.organizationWide) return failure(new ForbiddenError('Organization-wide time off requires organization-wide role'))
    return this.employeeWrite(context, id, 'employee.schedule.manage', EmployeeEventName.TIME_OFF_CREATED, async (employees) => {
      if (branchId && !await employees.findEmployeeBranch(this.scope(context), id, branchId)) {
        return failure(new BusinessRuleViolationError('Employee is not assigned to branch'))
      }
      return success(await employees.createTimeOff(this.scope(context), { id: this.dependencies.ids.generate(), employeeId: id,
        branchId, startsAt: input.startsAt, endsAt: input.endsAt, reason: input.reason ?? null }))
    }, { branchId })
  }

  async cancelTimeOff(context: EmployeeUseCaseContext, id: string, timeOffId: string) {
    return this.scheduleWrite(context, id, EmployeeEventName.TIME_OFF_CANCELLED, async (employees) => {
      const value = await employees.cancelTimeOff(this.scope(context), id, timeOffId)
      return value ? success(value) : failure(new BusinessRuleViolationError('Time off is missing or cannot be cancelled'))
    }, { timeOffId })
  }

  private scope(context: EmployeeUseCaseContext): TenantScope {
    return { organizationId: context.subject.organizationId, branchId: context.branchId }
  }

  private authorize(context: EmployeeUseCaseContext, permission: string, branchId: string) {
    return this.dependencies.policyEngine.authorize(this.dependencies.policy, context.subject, { permission },
      { organizationId: context.subject.organizationId, branchId, ownerId: null })
  }

  private requireBranch(context: EmployeeUseCaseContext, branchId: string): Result<void, TenantIsolationError> {
    return branchId === context.branchId ? success(undefined)
      : failure(new TenantIsolationError('Branch must match branch context'))
  }

  private async employeeWrite<T>(
    context: EmployeeUseCaseContext, id: string, permission: string, event: string,
    work: (repository: EmployeeRepository) => Promise<Result<T, DomainError>>, payload: Readonly<Record<string, unknown>> = {},
  ): Promise<Result<T, DomainError>> {
    const result = await this.dependencies.transactions.withTransaction(async ({ employees }) => {
      const employee = await employees.findById(this.scope(context), id)
      if (!employee.ok) return employee
      const allowed = this.authorize(context, permission, context.branchId)
      return allowed.ok ? work(employees) : allowed
    })
    return this.publish(result, event, id, payload)
  }

  private scheduleWrite<T>(
    context: EmployeeUseCaseContext, id: string, event: string,
    work: (repository: EmployeeRepository) => Promise<Result<T, DomainError>>, payload: Readonly<Record<string, unknown>>,
  ) { return this.employeeWrite(context, id, 'employee.schedule.manage', event, work, payload) }

  private async publish<T>(result: Result<T, DomainError>, name: string, employeeId: string,
    payload: Readonly<Record<string, unknown>>): Promise<Result<T, DomainError>> {
    if (!result.ok) return result
    const published = await this.dependencies.events.publish([this.dependencies.eventFactory.create({
      name, aggregateId: employeeId, payload: { employeeId, ...payload },
    })])
    return published.ok ? result : published
  }
}

export class CreateEmployee { constructor(private readonly ops: EmployeeOperations) {} execute(c: EmployeeUseCaseContext, i: CreateEmployeeRequest) { return this.ops.create(c, i) } }
export class UpdateEmployee { constructor(private readonly ops: EmployeeOperations) {} execute(c: EmployeeUseCaseContext, id: string, i: UpdateEmployeeRequest) { return this.ops.update(c, id, i) } }
export class GetEmployee { constructor(private readonly ops: EmployeeOperations) {} execute(c: EmployeeUseCaseContext, id: string) { return this.ops.get(c, id) } }
export class GetEmployeeList { constructor(private readonly ops: EmployeeOperations) {} execute(c: EmployeeUseCaseContext, q: EmployeeListQuery) { return this.ops.list(c, q) } }
export class SearchEmployee extends GetEmployeeList {}
export class ArchiveEmployee { constructor(private readonly ops: EmployeeOperations) {} execute(c: EmployeeUseCaseContext, id: string) { return this.ops.archive(c, id) } }
export class RestoreEmployee { constructor(private readonly ops: EmployeeOperations) {} execute(c: EmployeeUseCaseContext, id: string) { return this.ops.restore(c, id) } }
export class AssignEmployeeToBranch { constructor(private readonly ops: EmployeeOperations) {} execute(c: EmployeeUseCaseContext, id: string, b: string) { return this.ops.assignBranch(c, id, b) } }
export class RemoveEmployeeFromBranch { constructor(private readonly ops: EmployeeOperations) {} execute(c: EmployeeUseCaseContext, id: string, b: string) { return this.ops.removeBranch(c, id, b) } }
export class SetPrimaryEmployeeBranch { constructor(private readonly ops: EmployeeOperations) {} execute(c: EmployeeUseCaseContext, id: string, b: string) { return this.ops.setPrimaryBranch(c, id, b) } }
export class AssignEmployeeSkill { constructor(private readonly ops: EmployeeOperations) {} execute(c: EmployeeUseCaseContext, id: string, i: AssignSkillRequest) { return this.ops.assignSkill(c, id, i) } }
export class RemoveEmployeeSkill { constructor(private readonly ops: EmployeeOperations) {} execute(c: EmployeeUseCaseContext, id: string, s: string) { return this.ops.removeSkill(c, id, s) } }
export class SetWorkingHour { constructor(private readonly ops: EmployeeOperations) {} execute(c: EmployeeUseCaseContext, id: string, i: WorkingHourRequest) { return this.ops.setWorkingHour(c, id, i) } }
export class UpdateWorkingHour { constructor(private readonly ops: EmployeeOperations) {} execute(c: EmployeeUseCaseContext, id: string, w: string, i: UpdateWorkingHourRequest) { return this.ops.updateWorkingHour(c, id, w, i) } }
export class RemoveWorkingHour { constructor(private readonly ops: EmployeeOperations) {} execute(c: EmployeeUseCaseContext, id: string, w: string) { return this.ops.removeWorkingHour(c, id, w) } }
export class CreateEmployeeTimeOff { constructor(private readonly ops: EmployeeOperations) {} execute(c: EmployeeUseCaseContext, id: string, i: CreateTimeOffRequest) { return this.ops.createTimeOff(c, id, i) } }
export class CancelEmployeeTimeOff { constructor(private readonly ops: EmployeeOperations) {} execute(c: EmployeeUseCaseContext, id: string, t: string) { return this.ops.cancelTimeOff(c, id, t) } }
