import { describe, expect, it, vi } from 'vitest'
import type { ServiceCategoryRecord, ServiceRecord, ServiceRepository, SkillRecord } from '../../src/application/foundation/repositories.js'
import { PolicyEngine, ServicePolicy, type PolicySubject } from '../../src/application/foundation/policy.js'
import type { TransactionManager, TransactionScope } from '../../src/application/foundation/transaction.js'
import { DomainEventFactory, InProcessDomainEventDispatcher } from '../../src/domain/foundation/domain-events.js'
import { success, type Result } from '../../src/domain/foundation/result.js'
import { FixedClock } from '../../src/infrastructure/foundation/system-adapters.js'
import { createServiceSchema, enableBranchServiceSchema } from '../../src/modules/service-catalog/service-catalog.schemas.js'
import { ServiceCatalogOperations, type ServiceCatalogContext,
  type ServiceCatalogDependencies } from '../../src/modules/service-catalog/service-catalog.use-cases.js'

const organizationId = '10000000-0000-4000-8000-000000000001'
const branchId = '20000000-0000-4000-8000-000000000001'
const categoryId = '30000000-0000-4000-8000-000000000001'
const serviceId = '40000000-0000-4000-8000-000000000001'
const skillId = '50000000-0000-4000-8000-000000000001'
const now = new Date('2026-08-08T00:00:00.000Z')

const category: ServiceCategoryRecord = { id: categoryId, organizationId, name: 'Hair', description: null,
  displayOrder: 0, isActive: true, status: 'ACTIVE', deletedAt: null, createdAt: now, updatedAt: now }
const skill: SkillRecord = { id: skillId, organizationId, name: 'Color', description: null,
  isActive: true, status: 'ACTIVE', deletedAt: null, createdAt: now, updatedAt: now }
const service: ServiceRecord = { id: serviceId, organizationId, categoryId, categoryName: 'Hair', code: 'CUT',
  name: 'Hair Cut', description: null, durationMinutes: 60, bufferBeforeMinutes: 0, bufferAfterMinutes: 0,
  price: '500', taxType: 'NONE', taxMode: 'EXCLUDED', taxRate: '0', isActive: true, status: 'ACTIVE',
  deletedAt: null, branchServices: [], requiredSkills: [], createdAt: now, updatedAt: now }

class TestTransactions implements TransactionManager {
  calls = 0
  constructor(private readonly repository: ServiceRepository) {}
  async withTransaction<T, E>(work: (scope: TransactionScope) => Promise<Result<T, E>>) {
    this.calls += 1
    return work({ services: this.repository } as TransactionScope)
  }
}

function repository(overrides: Partial<ServiceRepository> = {}): ServiceRepository {
  const page = <T>(item: T) => ({ items: [item], page: 1, pageSize: 20, totalItems: 1, totalPages: 1 })
  return {
    findById: vi.fn().mockResolvedValue(success(service)), findByIdAnyStatus: vi.fn().mockResolvedValue(success(service)),
    acquireCatalogLock: vi.fn().mockResolvedValue(undefined), findPage: vi.fn().mockResolvedValue(page(service)),
    findActiveByName: vi.fn().mockResolvedValue(null), findActiveByCode: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue(service), update: vi.fn().mockResolvedValue({ ...service, name: 'Updated' }),
    archive: vi.fn().mockResolvedValue({ ...service, status: 'ARCHIVED', isActive: false, deletedAt: now }),
    restore: vi.fn().mockResolvedValue(service),
    findCategoryById: vi.fn().mockResolvedValue(success(category)),
    findCategoryByIdAnyStatus: vi.fn().mockResolvedValue(success(category)),
    findCategoryPage: vi.fn().mockResolvedValue(page(category)), findActiveCategoryByName: vi.fn().mockResolvedValue(null),
    createCategory: vi.fn().mockResolvedValue(category), updateCategory: vi.fn().mockResolvedValue({ ...category, name: 'Updated' }),
    archiveCategory: vi.fn().mockResolvedValue({ ...category, status: 'ARCHIVED', isActive: false, deletedAt: now }),
    restoreCategory: vi.fn().mockResolvedValue(category), branchExists: vi.fn().mockResolvedValue(true),
    enableBranchService: vi.fn().mockResolvedValue({ id: 'bs', branchId, branchName: 'Main', serviceId,
      priceOverride: null, durationOverrideMinutes: null, effectivePrice: '500', effectiveDurationMinutes: 60,
      isActive: true, deletedAt: null, createdAt: now, updatedAt: now }),
    findBranchService: vi.fn().mockResolvedValue(null), findBranchServicePage: vi.fn().mockResolvedValue(page({})),
    updateBranchService: vi.fn().mockResolvedValue({ id: 'bs', branchId, branchName: 'Main', serviceId,
      priceOverride: '600', durationOverrideMinutes: 75, effectivePrice: '600', effectiveDurationMinutes: 75,
      isActive: true, deletedAt: null, createdAt: now, updatedAt: now }),
    disableBranchService: vi.fn().mockResolvedValue({ id: 'bs', branchId, branchName: 'Main', serviceId,
      priceOverride: null, durationOverrideMinutes: null, effectivePrice: '500', effectiveDurationMinutes: 60,
      isActive: false, deletedAt: now, createdAt: now, updatedAt: now }),
    findSkillById: vi.fn().mockResolvedValue(success(skill)), findSkillByIdAnyStatus: vi.fn().mockResolvedValue(success(skill)),
    findSkillPage: vi.fn().mockResolvedValue(page(skill)), findActiveSkillByName: vi.fn().mockResolvedValue(null),
    createSkill: vi.fn().mockResolvedValue(skill), updateSkill: vi.fn().mockResolvedValue({ ...skill, name: 'Updated' }),
    archiveSkill: vi.fn().mockResolvedValue({ ...skill, status: 'ARCHIVED', isActive: false, deletedAt: now }),
    restoreSkill: vi.fn().mockResolvedValue(skill), assignServiceSkill: vi.fn().mockResolvedValue({ id: 'ss', serviceId,
      skillId, skillName: 'Color', requiredLevel: 3, createdAt: now, updatedAt: now }),
    removeServiceSkill: vi.fn().mockResolvedValue(true), findServiceSkills: vi.fn().mockResolvedValue([]), ...overrides,
  }
}

function harness(options: { overrides?: Partial<ServiceRepository>; permissions?: string[]; selectedBranch?: string } = {}) {
  const repo = repository(options.overrides); const transactions = new TestTransactions(repo); const clock = new FixedClock(now)
  const permissions = options.permissions ?? ['service.category.manage', 'service.create', 'service.read', 'service.update',
    'service.archive', 'service.restore', 'service.branch.manage', 'service.skill.manage', 'skill.create', 'skill.read',
    'skill.update', 'skill.archive', 'skill.restore']
  const subject: PolicySubject = { userId: 'user', organizationId, branchIds: new Set([branchId]),
    permissions: new Set(permissions) }
  const context: ServiceCatalogContext = { subject, ...(options.selectedBranch ? { branchId: options.selectedBranch } : {}) }
  const dependencies: ServiceCatalogDependencies = { repository: repo, transactions, policyEngine: new PolicyEngine(),
    policy: new ServicePolicy(), eventFactory: new DomainEventFactory(clock, { generate: () => 'event' }),
    events: new InProcessDomainEventDispatcher(), clock, ids: { generate: () => 'new-id' } }
  return { operations: new ServiceCatalogOperations(dependencies), context, repo, transactions }
}

const serviceInput = { categoryId, code: 'CUT', name: 'Hair Cut', durationMinutes: 60,
  bufferBeforeMinutes: 0, bufferAfterMinutes: 0, price: '500', taxType: 'NONE' as const,
  taxMode: 'EXCLUDED' as const, taxRate: '0', isActive: true }

describe('Service and skill use cases', () => {
  it('creates, updates, archives, and restores categories through transactions', async () => {
    const test = harness({ overrides: { findCategoryByIdAnyStatus: vi.fn().mockResolvedValue(success({ ...category,
      status: 'ARCHIVED', isActive: false, deletedAt: now })) } })
    expect((await test.operations.createCategory(test.context, { name: 'Hair', displayOrder: 0, isActive: true })).ok).toBe(true)
    expect((await test.operations.updateCategory(test.context, categoryId, { name: 'Updated' })).ok).toBe(true)
    expect((await test.operations.archiveCategory(test.context, categoryId)).ok).toBe(true)
    expect((await test.operations.restoreCategory(test.context, categoryId)).ok).toBe(true)
    expect(test.transactions.calls).toBe(4)
  })

  it('rejects duplicate category and skill names', async () => {
    const test = harness({ overrides: { findActiveCategoryByName: vi.fn().mockResolvedValue(category),
      findActiveSkillByName: vi.fn().mockResolvedValue(skill) } })
    expect(await test.operations.createCategory(test.context, { name: 'Hair', displayOrder: 0, isActive: true }))
      .toMatchObject({ ok: false, error: { code: 'CONFLICT' } })
    expect(await test.operations.createSkill(test.context, { name: 'Color', isActive: true }))
      .toMatchObject({ ok: false, error: { code: 'CONFLICT' } })
  })

  it('creates and updates a service with explicit tax defaults', async () => {
    const test = harness()
    expect((await test.operations.createService(test.context, serviceInput)).ok).toBe(true)
    expect((await test.operations.updateService(test.context, serviceId, { name: 'Updated' })).ok).toBe(true)
    expect(test.transactions.calls).toBe(2)
  })

  it('rejects archived categories and duplicate service names', async () => {
    const archived = { ...category, status: 'ARCHIVED' as const, isActive: false, deletedAt: now }
    const categoryTest = harness({ overrides: { findCategoryById: vi.fn().mockResolvedValue(success(archived)) } })
    expect(await categoryTest.operations.createService(categoryTest.context, serviceInput))
      .toMatchObject({ ok: false, error: { code: 'BUSINESS_RULE_VIOLATION' } })
    const duplicate = harness({ overrides: { findActiveByName: vi.fn().mockResolvedValue(service) } })
    expect(await duplicate.operations.createService(duplicate.context, serviceInput))
      .toMatchObject({ ok: false, error: { code: 'CONFLICT' } })
  })

  it('searches services and enforces branch isolation', async () => {
    const test = harness({ selectedBranch: branchId })
    expect((await test.operations.listServices(test.context, { keyword: 'cut', status: 'ACTIVE', branchId,
      page: 1, pageSize: 20, sort: 'name', order: 'asc' })).ok).toBe(true)
    expect(await test.operations.listServices(test.context, { status: 'ACTIVE', branchId: 'other',
      page: 1, pageSize: 20, sort: 'name', order: 'asc' }))
      .toMatchObject({ ok: false, error: { code: 'TENANT_ISOLATION' } })
  })

  it('enables, updates, and disables a branch service', async () => {
    const test = harness({ selectedBranch: branchId })
    expect((await test.operations.enableBranchService(test.context, serviceId, { branchId })).ok).toBe(true)
    expect((await test.operations.updateBranchService(test.context, serviceId, branchId, { priceOverride: '600' })).ok).toBe(true)
    expect((await test.operations.disableBranchService(test.context, serviceId, branchId)).ok).toBe(true)
  })

  it('manages skill lifecycle and service requirements', async () => {
    const anyStatus = vi.fn().mockResolvedValueOnce(success(skill)).mockResolvedValue(success({ ...skill,
      status: 'ARCHIVED', isActive: false, deletedAt: now }))
    const test = harness({ overrides: { findSkillByIdAnyStatus: anyStatus } })
    expect((await test.operations.createSkill(test.context, { name: 'Color', isActive: true })).ok).toBe(true)
    expect((await test.operations.updateSkill(test.context, skillId, { description: 'Advanced' })).ok).toBe(true)
    expect((await test.operations.archiveSkill(test.context, skillId)).ok).toBe(true)
    expect((await test.operations.restoreSkill(test.context, skillId)).ok).toBe(true)
    expect((await test.operations.assignServiceSkill(test.context, serviceId, { skillId, requiredLevel: 3 })).ok).toBe(true)
    expect((await test.operations.removeServiceSkill(test.context, serviceId, skillId)).ok).toBe(true)
  })

  it('blocks assignments for archived skills and duplicate mappings', async () => {
    const archived = { ...skill, status: 'ARCHIVED' as const, isActive: false, deletedAt: now }
    const blocked = harness({ overrides: { findSkillById: vi.fn().mockResolvedValue(success(archived)) } })
    expect(await blocked.operations.assignServiceSkill(blocked.context, serviceId, { skillId }))
      .toMatchObject({ ok: false, error: { code: 'BUSINESS_RULE_VIOLATION' } })
    const duplicate = harness({ overrides: { assignServiceSkill: vi.fn().mockResolvedValue(null) } })
    expect(await duplicate.operations.assignServiceSkill(duplicate.context, serviceId, { skillId }))
      .toMatchObject({ ok: false, error: { code: 'CONFLICT' } })
    const archivedService = { ...service, status: 'ARCHIVED' as const, isActive: false, deletedAt: now }
    const archivedServiceTest = harness({ selectedBranch: branchId,
      overrides: { findById: vi.fn().mockResolvedValue(success(archivedService)) } })
    expect(await archivedServiceTest.operations.enableBranchService(archivedServiceTest.context, serviceId, { branchId }))
      .toMatchObject({ ok: false, error: { code: 'BUSINESS_RULE_VIOLATION' } })
    expect(await archivedServiceTest.operations.removeServiceSkill(archivedServiceTest.context, serviceId, skillId))
      .toMatchObject({ ok: false, error: { code: 'BUSINESS_RULE_VIOLATION' } })
  })

  it('returns policy failures without touching a write repository', async () => {
    const test = harness({ permissions: [] })
    expect(await test.operations.getService(test.context, serviceId)).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } })
    expect(await test.operations.createService(test.context, serviceInput)).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } })
    expect(test.transactions.calls).toBe(0)
  })

  it('validates tax, price, duration, and branch overrides before execution', () => {
    expect(createServiceSchema.safeParse({ ...serviceInput, taxType: 'VAT', taxRate: '0' }).success).toBe(false)
    expect(createServiceSchema.safeParse({ ...serviceInput, price: '-1' }).success).toBe(false)
    expect(createServiceSchema.safeParse({ ...serviceInput, durationMinutes: 0 }).success).toBe(false)
    expect(enableBranchServiceSchema.safeParse({ branchId, durationOverrideMinutes: 0 }).success).toBe(false)
  })
})
