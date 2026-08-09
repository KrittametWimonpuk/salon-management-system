import type {
  CustomerListQuery,
  CustomerRecord,
  CustomerRepository,
  TenantScope,
  UpdateCustomerData,
} from '../../application/foundation/repositories.js'
import type { PageResult } from '../../application/foundation/query.js'
import type {
  CustomerPolicy,
  PolicyEngine,
  PolicySubject,
} from '../../application/foundation/policy.js'
import type { TransactionManager } from '../../application/foundation/transaction.js'
import {
  BusinessRuleViolationError,
  ConflictError,
  NotFoundError,
  TenantIsolationError,
  type DomainError,
} from '../../domain/foundation/domain-errors.js'
import type { DomainEventFactory, DomainEventPublisher } from '../../domain/foundation/domain-events.js'
import type { IdGenerator } from '../../domain/foundation/id-generator.js'
import { failure, success, type Result } from '../../domain/foundation/result.js'
import type { Clock } from '../../domain/foundation/time.js'
import { CustomerEventName } from './customer.events.js'
import type { CreateCustomerRequest, UpdateCustomerRequest } from './customer.schemas.js'

export interface CustomerUseCaseContext {
  subject: PolicySubject
  branchId?: string
}

export interface CustomerReadDependencies {
  repository: CustomerRepository
  policyEngine: PolicyEngine
  policy: CustomerPolicy
}

export interface CustomerWriteDependencies {
  transactions: TransactionManager
  policyEngine: PolicyEngine
  policy: CustomerPolicy
  eventFactory: DomainEventFactory
  events: DomainEventPublisher
  clock: Clock
  ids: IdGenerator
}

function authorize(
  dependencies: Pick<CustomerReadDependencies, 'policyEngine' | 'policy'>,
  context: CustomerUseCaseContext,
  permission: string,
  branchId?: string | null,
): Result<void, DomainError> {
  return dependencies.policyEngine.authorize(dependencies.policy, context.subject, { permission }, {
    organizationId: context.subject.organizationId,
    ...(branchId ? { branchId } : {}),
  })
}

function scope(context: CustomerUseCaseContext): TenantScope {
  return {
    organizationId: context.subject.organizationId,
    ...(context.branchId ? { branchId: context.branchId } : {}),
  }
}

export function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null
  const normalized = phone.replace(/[\s()-]/g, '')
  return normalized || null
}

function branchForChange(
  context: CustomerUseCaseContext,
  preferredBranchId: string | null | undefined,
): Result<string | null | undefined, TenantIsolationError> {
  if (preferredBranchId && preferredBranchId !== context.branchId) {
    return failure(new TenantIsolationError('Preferred branch must match the resolved branch context'))
  }
  return success(preferredBranchId)
}

async function publishResult(
  dependencies: Pick<CustomerWriteDependencies, 'eventFactory' | 'events'>,
  result: Result<CustomerRecord, DomainError>,
  eventName: string,
  payload: Readonly<Record<string, unknown>>,
): Promise<Result<CustomerRecord, DomainError>> {
  if (!result.ok) return result
  const published = await dependencies.events.publish([dependencies.eventFactory.create({
    name: eventName,
    aggregateId: result.value.id,
    payload: { customerId: result.value.id, organizationId: result.value.organizationId, ...payload },
  })])
  return published.ok ? result : published
}

export class CreateCustomer {
  constructor(private readonly dependencies: CustomerWriteDependencies) {}

  async execute(context: CustomerUseCaseContext, input: CreateCustomerRequest): Promise<Result<CustomerRecord, DomainError>> {
    const branch = branchForChange(context, input.preferredBranchId)
    if (!branch.ok) return branch
    const allowed = authorize(this.dependencies, context, 'customer.create', branch.value)
    if (!allowed.ok) return allowed
    const phone = normalizePhone(input.phone)
    const tenant = scope(context)
    const transaction = await this.dependencies.transactions.withTransaction(async ({ customers }) => {
      if (phone) {
        await customers.acquirePhoneLock(tenant, phone)
        if (await customers.findActiveByPhone(tenant, phone)) {
          return failure(new ConflictError('Phone is already assigned to an active customer', { field: 'phone' }))
        }
      }
      const customer = await customers.create({
        id: this.dependencies.ids.generate(),
        organizationId: tenant.organizationId,
        preferredBranchId: input.preferredBranchId ?? null,
        customerNumber: input.customerNumber,
        firstName: input.firstName,
        lastName: input.lastName ?? null,
        phone,
        email: input.email ?? null,
        dateOfBirth: input.dateOfBirth ?? null,
        notes: input.notes ?? null,
      })
      return success(customer)
    })
    return publishResult(this.dependencies, transaction, CustomerEventName.CREATED, {})
  }
}

export class UpdateCustomer {
  constructor(private readonly dependencies: CustomerWriteDependencies) {}

  async execute(
    context: CustomerUseCaseContext,
    customerId: string,
    input: UpdateCustomerRequest,
  ): Promise<Result<CustomerRecord, DomainError>> {
    const branch = branchForChange(context, input.preferredBranchId)
    if (!branch.ok) return branch
    const tenant = scope(context)
    const changedFields = Object.keys(input)
    const transaction = await this.dependencies.transactions.withTransaction(async ({ customers }) => {
      const existing = await customers.findById(tenant, customerId)
      if (!existing.ok) return existing
      const allowed = authorize(this.dependencies, context, 'customer.update', branch.value)
      if (!allowed.ok) return allowed
      const data: UpdateCustomerData = {
        ...(input.firstName !== undefined ? { firstName: input.firstName } : {}),
        ...(input.lastName !== undefined ? { lastName: input.lastName } : {}),
        ...(input.phone !== undefined ? { phone: normalizePhone(input.phone) } : {}),
        ...(input.email !== undefined ? { email: input.email } : {}),
        ...(input.dateOfBirth !== undefined ? { dateOfBirth: input.dateOfBirth } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ...(input.preferredBranchId !== undefined ? { preferredBranchId: input.preferredBranchId } : {}),
      }
      if (data.phone) {
        await customers.acquirePhoneLock(tenant, data.phone)
        if (await customers.findActiveByPhone(tenant, data.phone, customerId)) {
          return failure(new ConflictError('Phone is already assigned to an active customer', { field: 'phone' }))
        }
      }
      const updated = await customers.update(tenant, customerId, data)
      return updated ? success(updated) : failure(new NotFoundError('Customer was not found'))
    })
    return publishResult(this.dependencies, transaction, CustomerEventName.UPDATED, { changedFields })
  }
}

export class GetCustomer {
  constructor(private readonly dependencies: CustomerReadDependencies) {}

  async execute(context: CustomerUseCaseContext, customerId: string): Promise<Result<CustomerRecord, DomainError>> {
    const allowed = authorize(this.dependencies, context, 'customer.read')
    if (!allowed.ok) return allowed
    return this.dependencies.repository.findById(scope(context), customerId)
  }
}

export class GetCustomerList {
  constructor(private readonly dependencies: CustomerReadDependencies) {}

  async execute(
    context: CustomerUseCaseContext,
    query: CustomerListQuery,
  ): Promise<Result<PageResult<CustomerRecord>, DomainError>> {
    const allowed = authorize(this.dependencies, context, 'customer.read')
    if (!allowed.ok) return allowed
    return success(await this.dependencies.repository.findPage(scope(context), query))
  }
}

export class SearchCustomer extends GetCustomerList {}

export class ArchiveCustomer {
  constructor(private readonly dependencies: CustomerWriteDependencies) {}

  async execute(context: CustomerUseCaseContext, customerId: string): Promise<Result<CustomerRecord, DomainError>> {
    const tenant = scope(context)
    const transaction = await this.dependencies.transactions.withTransaction(async ({ customers }) => {
      const existing = await customers.findById(tenant, customerId)
      if (!existing.ok) return existing
      const allowed = authorize(this.dependencies, context, 'customer.archive')
      if (!allowed.ok) return allowed
      const archived = await customers.archive(tenant, customerId, this.dependencies.clock.utc())
      return archived ? success(archived) : failure(new ConflictError('Customer is already archived'))
    })
    return publishResult(this.dependencies, transaction, CustomerEventName.ARCHIVED, {})
  }
}

export class RestoreCustomer {
  constructor(private readonly dependencies: CustomerWriteDependencies) {}

  async execute(context: CustomerUseCaseContext, customerId: string): Promise<Result<CustomerRecord, DomainError>> {
    const tenant = scope(context)
    const transaction = await this.dependencies.transactions.withTransaction(async ({ customers }) => {
      const existing = await customers.findByIdAnyStatus(tenant, customerId)
      if (!existing.ok) return existing
      const allowed = authorize(this.dependencies, context, 'customer.restore')
      if (!allowed.ok) return allowed
      if (existing.value.status !== 'ARCHIVED') {
        return failure(new BusinessRuleViolationError('Customer is not archived'))
      }
      if (existing.value.phone) {
        await customers.acquirePhoneLock(tenant, existing.value.phone)
        if (await customers.findActiveByPhone(tenant, existing.value.phone, customerId)) {
          return failure(new ConflictError('Phone is already assigned to an active customer', { field: 'phone' }))
        }
      }
      const restored = await customers.restore(tenant, customerId)
      return restored ? success(restored) : failure(new ConflictError('Customer could not be restored'))
    })
    return publishResult(this.dependencies, transaction, CustomerEventName.RESTORED, {})
  }
}

export class AssignCustomerTag {
  constructor(private readonly dependencies: CustomerWriteDependencies) {}

  async execute(
    context: CustomerUseCaseContext,
    customerId: string,
    tagId: string,
  ): Promise<Result<CustomerRecord, DomainError>> {
    const tenant = scope(context)
    const transaction = await this.dependencies.transactions.withTransaction(async ({ customers }) => {
      const customer = await customers.findById(tenant, customerId)
      if (!customer.ok) return customer
      const allowed = authorize(this.dependencies, context, 'customer.tag.manage')
      if (!allowed.ok) return allowed
      if (!await customers.findActiveTag(tenant, tagId)) return failure(new NotFoundError('Customer tag was not found'))
      if (!await customers.assignTag(tenant, customerId, tagId)) {
        return failure(new ConflictError('Customer tag is already assigned'))
      }
      return customers.findById(tenant, customerId)
    })
    return publishResult(this.dependencies, transaction, CustomerEventName.TAG_ASSIGNED, { tagId })
  }
}

export class RemoveCustomerTag {
  constructor(private readonly dependencies: CustomerWriteDependencies) {}

  async execute(
    context: CustomerUseCaseContext,
    customerId: string,
    tagId: string,
  ): Promise<Result<CustomerRecord, DomainError>> {
    const tenant = scope(context)
    const transaction = await this.dependencies.transactions.withTransaction(async ({ customers }) => {
      const customer = await customers.findById(tenant, customerId)
      if (!customer.ok) return customer
      const allowed = authorize(this.dependencies, context, 'customer.tag.manage')
      if (!allowed.ok) return allowed
      if (!await customers.removeTag(tenant, customerId, tagId, this.dependencies.clock.utc())) {
        return failure(new NotFoundError('Customer tag assignment was not found'))
      }
      return customers.findById(tenant, customerId)
    })
    return publishResult(this.dependencies, transaction, CustomerEventName.TAG_REMOVED, { tagId })
  }
}
