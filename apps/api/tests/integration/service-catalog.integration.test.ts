import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { PolicyEngine, ServicePolicy, type PolicySubject } from '../../src/application/foundation/policy.js'
import { DomainEventFactory, InProcessDomainEventDispatcher } from '../../src/domain/foundation/domain-events.js'
import { FixedClock } from '../../src/infrastructure/foundation/system-adapters.js'
import { createPrismaRepositories } from '../../src/infrastructure/repositories/prisma-repositories.js'
import { PrismaTransactionManager } from '../../src/infrastructure/transaction/prisma-transaction-manager.js'
import { ServiceCatalogOperations, type ServiceCatalogContext,
  type ServiceCatalogDependencies } from '../../src/modules/service-catalog/service-catalog.use-cases.js'

const databaseUrl = process.env.TEST_DATABASE_URL
const database = databaseUrl ? new PrismaClient({ datasources: { db: { url: databaseUrl } } }) : null
const now = new Date('2026-08-08T00:00:00.000Z')

describe.runIf(database !== null)('Service catalog PostgreSQL integration', () => {
  let organizationId: string
  let otherOrganizationId: string
  let branchId: string
  let otherBranchId: string
  let operations: ServiceCatalogOperations

  beforeAll(async () => database!.$connect())
  beforeEach(async () => {
    const organizations = await database!.organization.findMany({ where: { name: { startsWith: 'Catalog Integration' } },
      select: { id: true } })
    const ids = organizations.map(({ id }) => id)
    if (ids.length) {
      await database!.serviceSkill.deleteMany({ where: { service: { organizationId: { in: ids } } } })
      await database!.branchService.deleteMany({ where: { service: { organizationId: { in: ids } } } })
      await database!.employeeSkill.deleteMany({ where: { skill: { organizationId: { in: ids } } } })
      await database!.service.deleteMany({ where: { organizationId: { in: ids } } })
      await database!.serviceCategory.deleteMany({ where: { organizationId: { in: ids } } })
      await database!.skill.deleteMany({ where: { organizationId: { in: ids } } })
      await database!.branch.deleteMany({ where: { organizationId: { in: ids } } })
      await database!.organization.deleteMany({ where: { id: { in: ids } } })
    }
    const primary = await database!.organization.create({ data: { name: 'Catalog Integration Primary',
      timezone: 'Asia/Bangkok', currency: 'THB' } })
    const other = await database!.organization.create({ data: { name: 'Catalog Integration Other',
      timezone: 'Asia/Bangkok', currency: 'THB' } })
    const branch = await database!.branch.create({ data: { organizationId: primary.id, code: 'MAIN',
      name: 'Main', countryCode: 'TH' } })
    const otherBranch = await database!.branch.create({ data: { organizationId: other.id, code: 'OTHER',
      name: 'Other', countryCode: 'TH' } })
    organizationId = primary.id; otherOrganizationId = other.id; branchId = branch.id; otherBranchId = otherBranch.id
    const clock = new FixedClock(now)
    const dependencies: ServiceCatalogDependencies = { repository: createPrismaRepositories(database!).services,
      transactions: new PrismaTransactionManager(database!), policyEngine: new PolicyEngine(), policy: new ServicePolicy(),
      eventFactory: new DomainEventFactory(clock, { generate: randomUUID }),
      events: new InProcessDomainEventDispatcher(), clock, ids: { generate: randomUUID } }
    operations = new ServiceCatalogOperations(dependencies)
  })
  afterAll(async () => database!.$disconnect())

  function context(selectedBranch?: string, organization = organizationId): ServiceCatalogContext {
    const permissions = new Set(['service.category.manage', 'service.create', 'service.read', 'service.update',
      'service.archive', 'service.restore', 'service.branch.manage', 'service.skill.manage', 'skill.create', 'skill.read',
      'skill.update', 'skill.archive', 'skill.restore'])
    const subject: PolicySubject = { userId: randomUUID(), organizationId: organization,
      branchIds: new Set(selectedBranch ? [selectedBranch] : []), permissions }
    return { subject, ...(selectedBranch ? { branchId: selectedBranch } : {}) }
  }

  async function createCategory(name = 'Hair') {
    const value = await operations.createCategory(context(), { name, displayOrder: 0, isActive: true })
    if (!value.ok) throw new Error(value.error.message)
    return value.value
  }

  async function createService(name = 'Hair Cut', code = `CUT-${randomUUID().slice(0, 6)}`) {
    const category = await createCategory(`Category-${randomUUID().slice(0, 6)}`)
    const value = await operations.createService(context(), { categoryId: category.id, code, name,
      durationMinutes: 60, bufferBeforeMinutes: 5, bufferAfterMinutes: 10, price: '500.00', taxType: 'VAT',
      taxMode: 'INCLUDED', taxRate: '7.00', isActive: true })
    if (!value.ok) throw new Error(value.error.message)
    return value.value
  }

  it('creates category, service, skill, branch override, and required skill', async () => {
    const service = await createService()
    const skill = await operations.createSkill(context(), { name: 'Precision Cutting', isActive: true })
    expect(skill.ok).toBe(true)
    if (!skill.ok) return
    const branch = await operations.enableBranchService(context(branchId), service.id, { branchId,
      priceOverride: '650.00', durationOverrideMinutes: 75 })
    expect(branch).toMatchObject({ ok: true, value: { effectivePrice: '650', effectiveDurationMinutes: 75 } })
    expect((await operations.assignServiceSkill(context(), service.id, { skillId: skill.value.id, requiredLevel: 4 })).ok).toBe(true)
    expect(await operations.getServiceSkills(context(), service.id)).toMatchObject({ ok: true,
      value: [{ skillId: skill.value.id, requiredLevel: 4 }] })
    expect(await operations.listServices(context(branchId), { keyword: 'Precision', categoryId: service.categoryId,
      branchId, skillId: skill.value.id, status: 'ACTIVE', page: 1, pageSize: 20, sort: 'name', order: 'asc' }))
      .toMatchObject({ ok: true, value: { totalItems: 1, items: [{ id: service.id }] } })
  })

  it('updates branch price/duration and disables with soft delete', async () => {
    const service = await createService()
    expect((await operations.enableBranchService(context(branchId), service.id, { branchId })).ok).toBe(true)
    expect(await operations.updateBranchService(context(branchId), service.id, branchId,
      { priceOverride: '700.00', durationOverrideMinutes: 90 }))
      .toMatchObject({ ok: true, value: { effectivePrice: '700', effectiveDurationMinutes: 90 } })
    expect((await operations.disableBranchService(context(branchId), service.id, branchId)).ok).toBe(true)
    expect(await database!.branchService.findFirst({ where: { serviceId: service.id, branchId } }))
      .toMatchObject({ isActive: false, deletedAt: now })
  })

  it('archives and restores catalog rows without removing associations', async () => {
    const service = await createService()
    await operations.enableBranchService(context(branchId), service.id, { branchId })
    expect(await operations.archiveService(context(), service.id)).toMatchObject({ ok: true, value: { status: 'ARCHIVED' } })
    expect(await database!.branchService.count({ where: { serviceId: service.id } })).toBe(1)
    expect(await operations.restoreService(context(), service.id)).toMatchObject({ ok: true, value: { status: 'ACTIVE' } })
  })

  it('enforces tenant and branch isolation', async () => {
    const service = await createService()
    expect(await operations.getService(context(undefined, otherOrganizationId), service.id))
      .toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } })
    expect(await operations.enableBranchService(context(otherBranchId), service.id, { branchId: otherBranchId }))
      .toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } })
    expect(await operations.listServices(context(branchId), { status: 'ACTIVE', branchId: otherBranchId,
      page: 1, pageSize: 20, sort: 'name', order: 'asc' }))
      .toMatchObject({ ok: false, error: { code: 'TENANT_ISOLATION' } })
  })

  it('prevents duplicate names, branch services, and service-skill mappings', async () => {
    const category = await createCategory('Unique Hair')
    expect(await operations.createCategory(context(), { name: 'unique hair', displayOrder: 1, isActive: true }))
      .toMatchObject({ ok: false, error: { code: 'CONFLICT' } })
    const service = await operations.createService(context(), { categoryId: category.id, code: 'DUP-1', name: 'Wash',
      durationMinutes: 30, bufferBeforeMinutes: 0, bufferAfterMinutes: 0, price: '200', taxType: 'NONE',
      taxMode: 'EXCLUDED', taxRate: '0', isActive: true })
    expect(service.ok).toBe(true); if (!service.ok) return
    expect(await operations.createService(context(), { categoryId: category.id, code: 'DUP-2', name: 'wash',
      durationMinutes: 30, bufferBeforeMinutes: 0, bufferAfterMinutes: 0, price: '200', taxType: 'NONE',
      taxMode: 'EXCLUDED', taxRate: '0', isActive: true })).toMatchObject({ ok: false, error: { code: 'CONFLICT' } })
    expect((await operations.enableBranchService(context(branchId), service.value.id, { branchId })).ok).toBe(true)
    expect(await operations.enableBranchService(context(branchId), service.value.id, { branchId }))
      .toMatchObject({ ok: false, error: { code: 'CONFLICT' } })
    const skill = await operations.createSkill(context(), { name: 'Wash', isActive: true }); if (!skill.ok) return
    expect((await operations.assignServiceSkill(context(), service.value.id, { skillId: skill.value.id })).ok).toBe(true)
    expect(await operations.assignServiceSkill(context(), service.value.id, { skillId: skill.value.id }))
      .toMatchObject({ ok: false, error: { code: 'CONFLICT' } })
  })

  it('hard-deletes only the approved ServiceSkill join row', async () => {
    const service = await createService(); const skill = await operations.createSkill(context(), { name: 'Styling', isActive: true })
    if (!skill.ok) return
    await operations.assignServiceSkill(context(), service.id, { skillId: skill.value.id })
    expect((await operations.removeServiceSkill(context(), service.id, skill.value.id)).ok).toBe(true)
    expect(await database!.serviceSkill.count({ where: { serviceId: service.id, skillId: skill.value.id } })).toBe(0)
    expect(await database!.service.count({ where: { id: service.id } })).toBe(1)
    expect(await database!.skill.count({ where: { id: skill.value.id } })).toBe(1)
  })

  it('rolls back catalog writes on technical failure', async () => {
    const id = randomUUID(); const manager = new PrismaTransactionManager(database!)
    await expect(manager.withTransaction(async ({ services }) => {
      await services.createCategory({ id, organizationId, name: 'Rollback', description: null, displayOrder: 0, isActive: true })
      throw new Error('technical rollback')
    })).rejects.toThrow('technical rollback')
    expect(await database!.serviceCategory.count({ where: { id } })).toBe(0)
  })

  it('prevents concurrent duplicate service names', async () => {
    const category = await createCategory('Concurrency')
    const input = (code: string) => ({ categoryId: category.id, code, name: 'Concurrent Name', durationMinutes: 30,
      bufferBeforeMinutes: 0, bufferAfterMinutes: 0, price: '300', taxType: 'NONE' as const,
      taxMode: 'EXCLUDED' as const, taxRate: '0', isActive: true })
    const results = await Promise.all([operations.createService(context(), input('CON-1')),
      operations.createService(context(), input('CON-2'))])
    expect(results.filter((value) => value.ok)).toHaveLength(1)
    expect(await database!.service.count({ where: { organizationId, name: 'Concurrent Name', deletedAt: null } })).toBe(1)
  })
})
