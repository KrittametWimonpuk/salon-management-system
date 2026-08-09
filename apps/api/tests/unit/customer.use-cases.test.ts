import { describe, expect, it } from 'vitest'
import type {
  CreateCustomerData,
  CustomerListQuery,
  CustomerRecord,
  CustomerRepository,
  CustomerTagRecord,
  TenantScope,
  UpdateCustomerData,
} from '../../src/application/foundation/repositories.js'
import { CustomerPolicy, PolicyEngine, type PolicySubject } from '../../src/application/foundation/policy.js'
import type { TransactionManager, TransactionScope } from '../../src/application/foundation/transaction.js'
import { NotFoundError, type DomainError } from '../../src/domain/foundation/domain-errors.js'
import { DomainEventFactory, type DomainEvent, type DomainEventPublisher } from '../../src/domain/foundation/domain-events.js'
import { failure, success, type Result } from '../../src/domain/foundation/result.js'
import { FixedClock } from '../../src/infrastructure/foundation/system-adapters.js'
import { CustomerEventName } from '../../src/modules/customer/customer.events.js'
import { createCustomerSchema, updateCustomerSchema } from '../../src/modules/customer/customer.schemas.js'
import {
  ArchiveCustomer,
  AssignCustomerTag,
  CreateCustomer,
  RemoveCustomerTag,
  RestoreCustomer,
  SearchCustomer,
  UpdateCustomer,
  type CustomerReadDependencies,
  type CustomerUseCaseContext,
  type CustomerWriteDependencies,
} from '../../src/modules/customer/customer.use-cases.js'

const org = '10000000-0000-4000-8000-000000000001'
const branch = '20000000-0000-4000-8000-000000000001'
const customerId = '30000000-0000-4000-8000-000000000001'
const tagId = '40000000-0000-4000-8000-000000000001'
const now = new Date('2026-08-08T00:00:00.000Z')

class InMemoryCustomerRepository implements CustomerRepository {
  readonly records = new Map<string, CustomerRecord>()
  readonly tags = new Map<string, CustomerTagRecord>([[tagId, { id: tagId, name: 'VIP', color: '#000000' }]])
  readonly assignments = new Set<string>()

  async findById(scope: TenantScope, id: string): Promise<Result<CustomerRecord, NotFoundError>> {
    const record = this.records.get(id)
    return record?.organizationId === scope.organizationId && record.status === 'ACTIVE'
      ? success(record)
      : failure(new NotFoundError('Customer was not found'))
  }

  async findByIdAnyStatus(scope: TenantScope, id: string): Promise<Result<CustomerRecord, NotFoundError>> {
    const record = this.records.get(id)
    return record?.organizationId === scope.organizationId
      ? success(record)
      : failure(new NotFoundError('Customer was not found'))
  }

  async findPage(scope: TenantScope, query: CustomerListQuery) {
    let items = [...this.records.values()].filter((item) => item.organizationId === scope.organizationId)
    if (query.status !== 'ALL') items = items.filter((item) => item.status === query.status)
    if (query.keyword) {
      const keyword = query.keyword.toLowerCase()
      items = items.filter((item) => `${item.firstName} ${item.lastName ?? ''} ${item.phone ?? ''}`.toLowerCase().includes(keyword))
    }
    if (query.tagId) items = items.filter((item) => this.assignments.has(`${item.id}:${query.tagId}`))
    return { items, page: query.page, pageSize: query.pageSize, totalItems: items.length, totalPages: items.length ? 1 : 0 }
  }

  async acquirePhoneLock(): Promise<void> {}

  async findActiveByPhone(scope: TenantScope, phone: string, excludeCustomerId?: string): Promise<CustomerRecord | null> {
    return [...this.records.values()].find((item) => item.organizationId === scope.organizationId
      && item.status === 'ACTIVE' && item.phone === phone && item.id !== excludeCustomerId) ?? null
  }

  async create(data: CreateCustomerData): Promise<CustomerRecord> {
    const record = recordFrom(data)
    this.records.set(record.id, record)
    return record
  }

  async update(scope: TenantScope, id: string, data: UpdateCustomerData): Promise<CustomerRecord | null> {
    const existing = this.records.get(id)
    if (!existing || existing.organizationId !== scope.organizationId || existing.status !== 'ACTIVE') return null
    const { dateOfBirth, ...otherChanges } = data
    const updated: CustomerRecord = {
      ...existing,
      ...otherChanges,
      ...(dateOfBirth !== undefined
        ? { dateOfBirth: dateOfBirth ? new Date(`${dateOfBirth}T00:00:00.000Z`) : null }
        : {}),
      updatedAt: now,
    }
    this.records.set(id, updated)
    return updated
  }

  async archive(scope: TenantScope, id: string, archivedAt: Date): Promise<CustomerRecord | null> {
    const existing = this.records.get(id)
    if (!existing || existing.organizationId !== scope.organizationId || existing.status !== 'ACTIVE') return null
    const archived: CustomerRecord = { ...existing, deletedAt: archivedAt, status: 'ARCHIVED' }
    this.records.set(id, archived)
    return archived
  }

  async restore(scope: TenantScope, id: string): Promise<CustomerRecord | null> {
    const existing = this.records.get(id)
    if (!existing || existing.organizationId !== scope.organizationId || existing.status !== 'ARCHIVED') return null
    const restored: CustomerRecord = { ...existing, deletedAt: null, status: 'ACTIVE' }
    this.records.set(id, restored)
    return restored
  }

  async findActiveTag(scope: TenantScope, id: string): Promise<CustomerTagRecord | null> {
    return scope.organizationId === org ? this.tags.get(id) ?? null : null
  }

  async assignTag(_scope: TenantScope, id: string, assignedTagId: string): Promise<boolean> {
    const key = `${id}:${assignedTagId}`
    if (this.assignments.has(key)) return false
    this.assignments.add(key)
    this.syncTags(id)
    return true
  }

  async removeTag(_scope: TenantScope, id: string, removedTagId: string): Promise<boolean> {
    const removed = this.assignments.delete(`${id}:${removedTagId}`)
    this.syncTags(id)
    return removed
  }

  private syncTags(id: string): void {
    const record = this.records.get(id)
    if (!record) return
    const tags = [...this.tags.values()].filter((tag) => this.assignments.has(`${id}:${tag.id}`))
    this.records.set(id, { ...record, tags })
  }
}

class InMemoryTransactionManager implements TransactionManager {
  calls = 0
  constructor(private readonly customers: CustomerRepository) {}

  async withTransaction<T, E>(work: (scope: TransactionScope) => Promise<Result<T, E>>) {
    this.calls += 1
    return work({ customers: this.customers } as TransactionScope)
  }
}

class CapturingEvents implements DomainEventPublisher {
  readonly published: DomainEvent[] = []
  async publish(events: readonly DomainEvent[]): Promise<Result<void, DomainError>> {
    this.published.push(...events)
    return success(undefined)
  }
}

function recordFrom(data: CreateCustomerData): CustomerRecord {
  return {
    ...data,
    dateOfBirth: data.dateOfBirth ? new Date(`${data.dateOfBirth}T00:00:00.000Z`) : null,
    lastVisitAt: null,
    deletedAt: null,
    status: 'ACTIVE',
    tags: [],
    createdAt: now,
    updatedAt: now,
  }
}

function createHarness(permissions = [
  'customer.create', 'customer.read', 'customer.update', 'customer.archive',
  'customer.restore', 'customer.tag.manage',
]) {
  const repository = new InMemoryCustomerRepository()
  const transactions = new InMemoryTransactionManager(repository)
  const events = new CapturingEvents()
  const policyEngine = new PolicyEngine()
  const policy = new CustomerPolicy()
  let nextId = customerId
  const clock = new FixedClock(now)
  const write: CustomerWriteDependencies = {
    transactions, policyEngine, policy, events, clock,
    ids: { generate: () => nextId },
    eventFactory: new DomainEventFactory(clock, { generate: () => `event-${nextId}` }),
  }
  const read: CustomerReadDependencies = { repository, policyEngine, policy }
  const subject: PolicySubject = {
    userId: 'user-1', organizationId: org, branchIds: new Set([branch]), permissions: new Set(permissions),
  }
  const context: CustomerUseCaseContext = { subject, branchId: branch }
  return { repository, transactions, events, write, read, context, setNextId: (id: string) => { nextId = id } }
}

const validInput = {
  customerNumber: 'CUS-001', firstName: 'Ada', phone: '081-234-5678', preferredBranchId: branch,
}

describe('Customer use cases', () => {
  it('creates a normalized customer in a transaction and publishes CustomerCreated', async () => {
    const harness = createHarness()
    const result = await new CreateCustomer(harness.write).execute(harness.context, validInput)

    expect(result).toMatchObject({ ok: true, value: { phone: '0812345678', status: 'ACTIVE' } })
    expect(harness.transactions.calls).toBe(1)
    expect(harness.events.published[0]?.name).toBe(CustomerEventName.CREATED)
  })

  it('updates an active customer and publishes changed fields', async () => {
    const harness = createHarness()
    await new CreateCustomer(harness.write).execute(harness.context, validInput)
    const result = await new UpdateCustomer(harness.write).execute(harness.context, customerId, { firstName: 'Grace' })

    expect(result).toMatchObject({ ok: true, value: { firstName: 'Grace' } })
    expect(harness.events.published.at(-1)?.name).toBe(CustomerEventName.UPDATED)
  })

  it('archives and restores using soft-delete status', async () => {
    const harness = createHarness()
    await new CreateCustomer(harness.write).execute(harness.context, validInput)
    const archived = await new ArchiveCustomer(harness.write).execute(harness.context, customerId)
    const restored = await new RestoreCustomer(harness.write).execute(harness.context, customerId)

    expect(archived).toMatchObject({ ok: true, value: { status: 'ARCHIVED' } })
    expect(restored).toMatchObject({ ok: true, value: { status: 'ACTIVE' } })
  })

  it('searches by keyword and active status', async () => {
    const harness = createHarness()
    await new CreateCustomer(harness.write).execute(harness.context, validInput)
    const result = await new SearchCustomer(harness.read).execute(harness.context, {
      keyword: 'ada', status: 'ACTIVE', page: 1, pageSize: 20, sort: 'createdAt', order: 'desc',
    })

    expect(result).toMatchObject({ ok: true, value: { totalItems: 1 } })
  })

  it('assigns and removes an organization-owned tag', async () => {
    const harness = createHarness()
    await new CreateCustomer(harness.write).execute(harness.context, validInput)
    const assigned = await new AssignCustomerTag(harness.write).execute(harness.context, customerId, tagId)
    const removed = await new RemoveCustomerTag(harness.write).execute(harness.context, customerId, tagId)

    expect(assigned).toMatchObject({ ok: true, value: { tags: [{ name: 'VIP' }] } })
    expect(removed).toMatchObject({ ok: true, value: { tags: [] } })
  })

  it('returns policy and tenant failures before writing', async () => {
    const denied = createHarness([])
    const deniedResult = await new CreateCustomer(denied.write).execute(denied.context, validInput)
    const isolated = createHarness()
    const isolatedResult = await new CreateCustomer(isolated.write).execute(isolated.context, {
      ...validInput, preferredBranchId: '20000000-0000-4000-8000-000000000099',
    })

    expect(deniedResult).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } })
    expect(denied.transactions.calls).toBe(0)
    expect(isolatedResult).toMatchObject({ ok: false, error: { code: 'TENANT_ISOLATION' } })
  })

  it('rejects a duplicate active phone', async () => {
    const harness = createHarness()
    await new CreateCustomer(harness.write).execute(harness.context, validInput)
    harness.setNextId('30000000-0000-4000-8000-000000000002')
    const duplicate = await new CreateCustomer(harness.write).execute(harness.context, {
      ...validInput, customerNumber: 'CUS-002', phone: '081 234 5678',
    })

    expect(duplicate).toMatchObject({ ok: false, error: { code: 'CONFLICT' } })
  })

  it('keeps Zod validation separate from business rules', () => {
    expect(createCustomerSchema.safeParse({ ...validInput, phone: 'invalid' }).success).toBe(false)
    expect(updateCustomerSchema.safeParse({}).success).toBe(false)
  })
})
