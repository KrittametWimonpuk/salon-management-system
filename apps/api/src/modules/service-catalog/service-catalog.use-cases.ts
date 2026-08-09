import type {
  CatalogListQuery, CreateServiceData, ServiceCategoryRecord, ServiceListQuery,
  ServiceRecord, ServiceRepository, ServiceSkillRecord, SkillRecord, TenantScope, UpdateServiceData,
} from '../../application/foundation/repositories.js'
import type { PageResult } from '../../application/foundation/query.js'
import type { PolicyEngine, PolicySubject, ServicePolicy } from '../../application/foundation/policy.js'
import type { TransactionManager } from '../../application/foundation/transaction.js'
import { BusinessRuleViolationError, ConflictError, NotFoundError, TenantIsolationError,
  type DomainError } from '../../domain/foundation/domain-errors.js'
import type { DomainEventFactory, DomainEventPublisher } from '../../domain/foundation/domain-events.js'
import type { IdGenerator } from '../../domain/foundation/id-generator.js'
import { failure, success, type Result } from '../../domain/foundation/result.js'
import type { Clock } from '../../domain/foundation/time.js'
import { ServiceCatalogEventName } from './service-catalog.events.js'
import type { AssignServiceSkillRequest, CreateServiceCategoryRequest, CreateServiceRequest, CreateSkillRequest,
  EnableBranchServiceRequest, UpdateBranchServiceRequest, UpdateServiceCategoryRequest, UpdateServiceRequest,
  UpdateSkillRequest } from './service-catalog.schemas.js'

export interface ServiceCatalogContext { subject: PolicySubject; branchId?: string }
export interface ServiceCatalogDependencies {
  repository: ServiceRepository
  transactions: TransactionManager
  policyEngine: PolicyEngine
  policy: ServicePolicy
  eventFactory: DomainEventFactory
  events: DomainEventPublisher
  clock: Clock
  ids: IdGenerator
}

export class ServiceCatalogOperations {
  constructor(private readonly dependencies: ServiceCatalogDependencies) {}

  async createCategory(context: ServiceCatalogContext, input: CreateServiceCategoryRequest) {
    const allowed = this.authorize(context, 'service.category.manage')
    if (!allowed.ok) return allowed
    const result = await this.dependencies.transactions.withTransaction(async ({ services }) => {
      await services.acquireCatalogLock(this.scope(context), `category:${input.name}`)
      if (await services.findActiveCategoryByName(this.scope(context), input.name)) return this.duplicate('Category name', 'name')
      return success(await services.createCategory({ id: this.dependencies.ids.generate(),
        organizationId: context.subject.organizationId, name: input.name, description: input.description ?? null,
        displayOrder: input.displayOrder, isActive: input.isActive }))
    })
    return this.publish(result, ServiceCatalogEventName.CATEGORY_CREATED, result.ok ? result.value.id : '', {})
  }

  async updateCategory(context: ServiceCatalogContext, id: string, input: UpdateServiceCategoryRequest) {
    const result = await this.dependencies.transactions.withTransaction(async ({ services }) => {
      const existing = await services.findCategoryById(this.scope(context), id)
      if (!existing.ok) return existing
      const allowed = this.authorize(context, 'service.category.manage')
      if (!allowed.ok) return allowed
      if (input.name) {
        await services.acquireCatalogLock(this.scope(context), `category:${input.name}`)
        if (await services.findActiveCategoryByName(this.scope(context), input.name, id)) return this.duplicate('Category name', 'name')
      }
      const value = await services.updateCategory(this.scope(context), id, {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.displayOrder !== undefined ? { displayOrder: input.displayOrder } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      })
      return value ? success(value) : failure(new NotFoundError('Service category was not found'))
    })
    return this.publish(result, ServiceCatalogEventName.CATEGORY_UPDATED, id, { changedFields: Object.keys(input) })
  }

  async getCategory(context: ServiceCatalogContext, id: string): Promise<Result<ServiceCategoryRecord, DomainError>> {
    const allowed = this.authorize(context, 'service.category.manage')
    return allowed.ok ? this.dependencies.repository.findCategoryByIdAnyStatus(this.scope(context), id) : allowed
  }

  async listCategories(context: ServiceCatalogContext, query: CatalogListQuery): Promise<Result<PageResult<ServiceCategoryRecord>, DomainError>> {
    const allowed = this.authorize(context, 'service.category.manage')
    return allowed.ok ? success(await this.dependencies.repository.findCategoryPage(this.scope(context), query)) : allowed
  }

  async archiveCategory(context: ServiceCatalogContext, id: string) {
    const result = await this.dependencies.transactions.withTransaction<ServiceCategoryRecord, DomainError>(async ({ services }) => {
      const existing = await services.findCategoryById(this.scope(context), id)
      if (!existing.ok) return existing
      const allowed = this.authorize(context, 'service.category.manage')
      if (!allowed.ok) return allowed
      const value = await services.archiveCategory(this.scope(context), id, this.dependencies.clock.utc())
      return value ? success(value) : failure(new ConflictError('Service category is already archived'))
    })
    return this.publish(result, ServiceCatalogEventName.CATEGORY_ARCHIVED, id, {})
  }

  async restoreCategory(context: ServiceCatalogContext, id: string) {
    const result = await this.dependencies.transactions.withTransaction(async ({ services }) => {
      const existing = await services.findCategoryByIdAnyStatus(this.scope(context), id)
      if (!existing.ok) return existing
      const allowed = this.authorize(context, 'service.category.manage')
      if (!allowed.ok) return allowed
      if (existing.value.status !== 'ARCHIVED') return failure(new BusinessRuleViolationError('Service category is not archived'))
      await services.acquireCatalogLock(this.scope(context), `category:${existing.value.name}`)
      if (await services.findActiveCategoryByName(this.scope(context), existing.value.name, id)) return this.duplicate('Category name', 'name')
      const value = await services.restoreCategory(this.scope(context), id)
      return value ? success(value) : failure(new ConflictError('Service category could not be restored'))
    })
    return this.publish(result, ServiceCatalogEventName.CATEGORY_RESTORED, id, {})
  }

  async createService(context: ServiceCatalogContext, input: CreateServiceRequest) {
    const allowed = this.authorize(context, 'service.create')
    if (!allowed.ok) return allowed
    const result = await this.dependencies.transactions.withTransaction<ServiceRecord, DomainError>(async ({ services }) => {
      const category = await services.findCategoryById(this.scope(context), input.categoryId)
      if (!category.ok || category.value.status !== 'ACTIVE') return failure(new BusinessRuleViolationError('Active service category is required'))
      const conflict = await this.lockAndCheckService(services, context, input.name, input.code)
      if (conflict) return failure(conflict)
      const data: CreateServiceData = { id: this.dependencies.ids.generate(), organizationId: context.subject.organizationId,
        categoryId: input.categoryId, code: input.code, name: input.name, description: input.description ?? null,
        durationMinutes: input.durationMinutes, bufferBeforeMinutes: input.bufferBeforeMinutes,
        bufferAfterMinutes: input.bufferAfterMinutes, price: input.price, taxType: input.taxType,
        taxMode: input.taxMode, taxRate: input.taxRate, isActive: input.isActive }
      return success(await services.create(data))
    })
    return this.publish(result, ServiceCatalogEventName.SERVICE_CREATED, result.ok ? result.value.id : '', {})
  }

  async updateService(context: ServiceCatalogContext, id: string, input: UpdateServiceRequest) {
    const result = await this.dependencies.transactions.withTransaction(async ({ services }) => {
      const existing = await services.findById(this.scope(context), id)
      if (!existing.ok) return existing
      const allowed = this.authorize(context, 'service.update')
      if (!allowed.ok) return allowed
      if (input.categoryId) {
        const category = await services.findCategoryById(this.scope(context), input.categoryId)
        if (!category.ok || category.value.status !== 'ACTIVE') return failure(new BusinessRuleViolationError('Active service category is required'))
      }
      const conflict = await this.lockAndCheckService(services, context, input.name ?? existing.value.name,
        input.code ?? existing.value.code, id)
      if (conflict) return failure(conflict)
      const taxType = input.taxType ?? existing.value.taxType
      const taxRate = input.taxRate ?? existing.value.taxRate
      if (!validTax(taxType, taxRate)) return failure(new BusinessRuleViolationError('Tax type and rate are inconsistent'))
      const data: UpdateServiceData = {
        ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
        ...(input.code !== undefined ? { code: input.code } : {}),
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.durationMinutes !== undefined ? { durationMinutes: input.durationMinutes } : {}),
        ...(input.bufferBeforeMinutes !== undefined ? { bufferBeforeMinutes: input.bufferBeforeMinutes } : {}),
        ...(input.bufferAfterMinutes !== undefined ? { bufferAfterMinutes: input.bufferAfterMinutes } : {}),
        ...(input.price !== undefined ? { price: input.price } : {}),
        ...(input.taxType !== undefined ? { taxType: input.taxType } : {}),
        ...(input.taxMode !== undefined ? { taxMode: input.taxMode } : {}),
        ...(input.taxRate !== undefined ? { taxRate: input.taxRate } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      }
      const value = await services.update(this.scope(context), id, data)
      return value ? success(value) : failure(new NotFoundError('Service was not found'))
    })
    return this.publish(result, ServiceCatalogEventName.SERVICE_UPDATED, id, { changedFields: Object.keys(input) })
  }

  async getService(context: ServiceCatalogContext, id: string): Promise<Result<ServiceRecord, DomainError>> {
    const allowed = this.authorize(context, 'service.read')
    return allowed.ok ? this.dependencies.repository.findByIdAnyStatus(this.scope(context), id) : allowed
  }

  async listServices(context: ServiceCatalogContext, query: ServiceListQuery): Promise<Result<PageResult<ServiceRecord>, DomainError>> {
    if (query.branchId && (!context.branchId || query.branchId !== context.branchId)) {
      return failure(new TenantIsolationError('Branch filter must match the resolved branch context'))
    }
    const allowed = this.authorize(context, 'service.read', query.branchId)
    return allowed.ok ? success(await this.dependencies.repository.findPage(this.scope(context), query)) : allowed
  }

  async archiveService(context: ServiceCatalogContext, id: string) {
    return this.serviceLifecycle(context, id, 'service.archive', ServiceCatalogEventName.SERVICE_ARCHIVED, true)
  }

  async restoreService(context: ServiceCatalogContext, id: string) {
    return this.serviceLifecycle(context, id, 'service.restore', ServiceCatalogEventName.SERVICE_RESTORED, false)
  }

  async enableBranchService(context: ServiceCatalogContext, id: string, input: EnableBranchServiceRequest) {
    const branch = this.requireBranch(context, input.branchId)
    if (!branch.ok) return branch
    const result = await this.dependencies.transactions.withTransaction(async ({ services }) => {
      const service = await services.findById(this.scope(context), id)
      if (!service.ok || service.value.status !== 'ACTIVE') return failure(new BusinessRuleViolationError('Active service is required'))
      const allowed = this.authorize(context, 'service.branch.manage', input.branchId)
      if (!allowed.ok) return allowed
      if (!await services.branchExists(this.scope(context), input.branchId)) return failure(new NotFoundError('Branch was not found'))
      const value = await services.enableBranchService(this.scope(context), { id: this.dependencies.ids.generate(),
        branchId: input.branchId, serviceId: id, priceOverride: input.priceOverride ?? null,
        durationOverrideMinutes: input.durationOverrideMinutes ?? null })
      return value ? success(value) : failure(new ConflictError('Service is already enabled for branch'))
    })
    return this.publish(result, ServiceCatalogEventName.BRANCH_ENABLED, id, { branchId: input.branchId })
  }

  async updateBranchService(context: ServiceCatalogContext, id: string, branchId: string, input: UpdateBranchServiceRequest) {
    const branch = this.requireBranch(context, branchId)
    if (!branch.ok) return branch
    const result = await this.dependencies.transactions.withTransaction(async ({ services }) => {
      const service = await services.findById(this.scope(context), id)
      if (!service.ok) return service
      const allowed = this.authorize(context, 'service.branch.manage', branchId)
      if (!allowed.ok) return allowed
      const value = await services.updateBranchService(this.scope(context), id, branchId, {
        ...(input.priceOverride !== undefined ? { priceOverride: input.priceOverride } : {}),
        ...(input.durationOverrideMinutes !== undefined ? { durationOverrideMinutes: input.durationOverrideMinutes } : {}),
      })
      return value ? success(value) : failure(new NotFoundError('Branch service was not found'))
    })
    return this.publish(result, ServiceCatalogEventName.BRANCH_UPDATED, id, { branchId, changedFields: Object.keys(input) })
  }

  async disableBranchService(context: ServiceCatalogContext, id: string, branchId: string) {
    const branch = this.requireBranch(context, branchId)
    if (!branch.ok) return branch
    const result = await this.dependencies.transactions.withTransaction(async ({ services }) => {
      const service = await services.findById(this.scope(context), id)
      if (!service.ok) return service
      const allowed = this.authorize(context, 'service.branch.manage', branchId)
      if (!allowed.ok) return allowed
      const value = await services.disableBranchService(this.scope(context), id, branchId, this.dependencies.clock.utc())
      return value ? success(value) : failure(new NotFoundError('Branch service was not found'))
    })
    return this.publish(result, ServiceCatalogEventName.BRANCH_DISABLED, id, { branchId })
  }

  async listBranchServices(context: ServiceCatalogContext, id: string, query: CatalogListQuery) {
    if (!context.branchId) return failure(new TenantIsolationError('Branch context is required'))
    const allowed = this.authorize(context, 'service.branch.manage', context.branchId)
    if (!allowed.ok) return allowed
    const service = await this.dependencies.repository.findByIdAnyStatus(this.scope(context), id)
    return service.ok ? success(await this.dependencies.repository.findBranchServicePage(this.scope(context), id, query)) : service
  }

  async createSkill(context: ServiceCatalogContext, input: CreateSkillRequest) {
    const allowed = this.authorize(context, 'skill.create')
    if (!allowed.ok) return allowed
    const result = await this.dependencies.transactions.withTransaction(async ({ services }) => {
      await services.acquireCatalogLock(this.scope(context), `skill:${input.name}`)
      if (await services.findActiveSkillByName(this.scope(context), input.name)) return this.duplicate('Skill name', 'name')
      return success(await services.createSkill({ id: this.dependencies.ids.generate(), organizationId: context.subject.organizationId,
        name: input.name, description: input.description ?? null, isActive: input.isActive }))
    })
    return this.publish(result, ServiceCatalogEventName.SKILL_CREATED, result.ok ? result.value.id : '', {})
  }

  async updateSkill(context: ServiceCatalogContext, id: string, input: UpdateSkillRequest) {
    const result = await this.dependencies.transactions.withTransaction(async ({ services }) => {
      const existing = await services.findSkillById(this.scope(context), id)
      if (!existing.ok) return existing
      const allowed = this.authorize(context, 'skill.update')
      if (!allowed.ok) return allowed
      if (input.name) {
        await services.acquireCatalogLock(this.scope(context), `skill:${input.name}`)
        if (await services.findActiveSkillByName(this.scope(context), input.name, id)) return this.duplicate('Skill name', 'name')
      }
      const value = await services.updateSkill(this.scope(context), id, {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      })
      return value ? success(value) : failure(new NotFoundError('Skill was not found'))
    })
    return this.publish(result, ServiceCatalogEventName.SKILL_UPDATED, id, { changedFields: Object.keys(input) })
  }

  async getSkill(context: ServiceCatalogContext, id: string): Promise<Result<SkillRecord, DomainError>> {
    const allowed = this.authorize(context, 'skill.read')
    return allowed.ok ? this.dependencies.repository.findSkillByIdAnyStatus(this.scope(context), id) : allowed
  }

  async listSkills(context: ServiceCatalogContext, query: CatalogListQuery): Promise<Result<PageResult<SkillRecord>, DomainError>> {
    const allowed = this.authorize(context, 'skill.read')
    return allowed.ok ? success(await this.dependencies.repository.findSkillPage(this.scope(context), query)) : allowed
  }

  async archiveSkill(context: ServiceCatalogContext, id: string) {
    return this.skillLifecycle(context, id, 'skill.archive', ServiceCatalogEventName.SKILL_ARCHIVED, true)
  }

  async restoreSkill(context: ServiceCatalogContext, id: string) {
    return this.skillLifecycle(context, id, 'skill.restore', ServiceCatalogEventName.SKILL_RESTORED, false)
  }

  async assignServiceSkill(context: ServiceCatalogContext, id: string, input: AssignServiceSkillRequest) {
    const result = await this.dependencies.transactions.withTransaction(async ({ services }) => {
      const service = await services.findById(this.scope(context), id)
      if (!service.ok || service.value.status !== 'ACTIVE') return failure(new BusinessRuleViolationError('Active service is required'))
      const allowed = this.authorize(context, 'service.skill.manage')
      if (!allowed.ok) return allowed
      const skill = await services.findSkillById(this.scope(context), input.skillId)
      if (!skill.ok || skill.value.status !== 'ACTIVE') return failure(new BusinessRuleViolationError('Active skill is required'))
      const value = await services.assignServiceSkill(this.scope(context), id, input.skillId,
        this.dependencies.ids.generate(), input.requiredLevel ?? null)
      return value ? success(value) : failure(new ConflictError('Skill is already assigned to service'))
    })
    return this.publish(result, ServiceCatalogEventName.SERVICE_SKILL_ASSIGNED, id, { skillId: input.skillId })
  }

  async removeServiceSkill(context: ServiceCatalogContext, id: string, skillId: string) {
    const result = await this.dependencies.transactions.withTransaction(async ({ services }) => {
      const service = await services.findById(this.scope(context), id)
      if (!service.ok || service.value.status !== 'ACTIVE') return failure(new BusinessRuleViolationError('Active service is required'))
      const allowed = this.authorize(context, 'service.skill.manage')
      if (!allowed.ok) return allowed
      if (!await services.removeServiceSkill(this.scope(context), id, skillId)) return failure(new NotFoundError('Service skill assignment was not found'))
      return success({ serviceId: id, skillId })
    })
    return this.publish(result, ServiceCatalogEventName.SERVICE_SKILL_REMOVED, id, { skillId })
  }

  async getServiceSkills(context: ServiceCatalogContext, id: string): Promise<Result<readonly ServiceSkillRecord[], DomainError>> {
    const allowed = this.authorize(context, 'service.read')
    if (!allowed.ok) return allowed
    const service = await this.dependencies.repository.findByIdAnyStatus(this.scope(context), id)
    return service.ok ? success(await this.dependencies.repository.findServiceSkills(this.scope(context), id)) : service
  }

  private scope(context: ServiceCatalogContext): TenantScope {
    return { organizationId: context.subject.organizationId, ...(context.branchId ? { branchId: context.branchId } : {}) }
  }

  private authorize(context: ServiceCatalogContext, permission: string, branchId?: string) {
    return this.dependencies.policyEngine.authorize(this.dependencies.policy, context.subject, { permission },
      { organizationId: context.subject.organizationId, ...(branchId ? { branchId } : {}) })
  }

  private requireBranch(context: ServiceCatalogContext, branchId: string): Result<void, TenantIsolationError> {
    return context.branchId === branchId ? success(undefined) : failure(new TenantIsolationError('Branch must match branch context'))
  }

  private duplicate(label: string, field: string) { return failure(new ConflictError(`${label} is already in use`, { field })) }

  private async lockAndCheckService(repository: ServiceRepository, context: ServiceCatalogContext,
    name: string, code: string, excludeId?: string): Promise<ConflictError | null> {
    await repository.acquireCatalogLock(this.scope(context), `service-name:${name}`)
    await repository.acquireCatalogLock(this.scope(context), `service-code:${code}`)
    if (await repository.findActiveByName(this.scope(context), name, excludeId)) return new ConflictError('Service name is already in use', { field: 'name' })
    if (await repository.findActiveByCode(this.scope(context), code, excludeId)) return new ConflictError('Service code is already in use', { field: 'code' })
    return null
  }

  private async serviceLifecycle(context: ServiceCatalogContext, id: string, permission: string, event: string, archive: boolean) {
    const result = await this.dependencies.transactions.withTransaction(async ({ services }) => {
      const existing = await services.findByIdAnyStatus(this.scope(context), id)
      if (!existing.ok) return existing
      const allowed = this.authorize(context, permission)
      if (!allowed.ok) return allowed
      if (archive && existing.value.status === 'ARCHIVED') return failure(new BusinessRuleViolationError('Service is already archived'))
      if (!archive && existing.value.status !== 'ARCHIVED') return failure(new BusinessRuleViolationError('Service is not archived'))
      if (!archive) {
        const category = await services.findCategoryById(this.scope(context), existing.value.categoryId)
        if (!category.ok || category.value.status !== 'ACTIVE') return failure(new BusinessRuleViolationError('Restore the service category first'))
        const conflict = await this.lockAndCheckService(services, context, existing.value.name, existing.value.code, id)
        if (conflict) return failure(conflict)
      }
      const value = archive ? await services.archive(this.scope(context), id, this.dependencies.clock.utc())
        : await services.restore(this.scope(context), id)
      return value ? success(value) : failure(new ConflictError('Service lifecycle change failed'))
    })
    return this.publish(result, event, id, {})
  }

  private async skillLifecycle(context: ServiceCatalogContext, id: string, permission: string, event: string, archive: boolean) {
    const result = await this.dependencies.transactions.withTransaction(async ({ services }) => {
      const existing = await services.findSkillByIdAnyStatus(this.scope(context), id)
      if (!existing.ok) return existing
      const allowed = this.authorize(context, permission)
      if (!allowed.ok) return allowed
      if (archive && existing.value.status === 'ARCHIVED') return failure(new BusinessRuleViolationError('Skill is already archived'))
      if (!archive && existing.value.status !== 'ARCHIVED') return failure(new BusinessRuleViolationError('Skill is not archived'))
      if (!archive) {
        await services.acquireCatalogLock(this.scope(context), `skill:${existing.value.name}`)
        if (await services.findActiveSkillByName(this.scope(context), existing.value.name, id)) return this.duplicate('Skill name', 'name')
      }
      const value = archive ? await services.archiveSkill(this.scope(context), id, this.dependencies.clock.utc())
        : await services.restoreSkill(this.scope(context), id)
      return value ? success(value) : failure(new ConflictError('Skill lifecycle change failed'))
    })
    return this.publish(result, event, id, {})
  }

  private async publish<T>(result: Result<T, DomainError>, name: string, aggregateId: string,
    payload: Readonly<Record<string, unknown>>): Promise<Result<T, DomainError>> {
    if (!result.ok) return result
    const published = await this.dependencies.events.publish([this.dependencies.eventFactory.create({
      name, aggregateId, payload: { aggregateId, ...payload },
    })])
    return published.ok ? result : published
  }
}

function validTax(type: 'NONE' | 'VAT', rate: string): boolean {
  const value = Number(rate)
  return type === 'NONE' ? value === 0 : value > 0 && value <= 100
}

export class CreateServiceCategory { constructor(private readonly o: ServiceCatalogOperations) {} execute(c: ServiceCatalogContext, i: CreateServiceCategoryRequest) { return this.o.createCategory(c, i) } }
export class UpdateServiceCategory { constructor(private readonly o: ServiceCatalogOperations) {} execute(c: ServiceCatalogContext, id: string, i: UpdateServiceCategoryRequest) { return this.o.updateCategory(c, id, i) } }
export class GetServiceCategory { constructor(private readonly o: ServiceCatalogOperations) {} execute(c: ServiceCatalogContext, id: string) { return this.o.getCategory(c, id) } }
export class GetServiceCategoryList { constructor(private readonly o: ServiceCatalogOperations) {} execute(c: ServiceCatalogContext, q: CatalogListQuery) { return this.o.listCategories(c, q) } }
export class ArchiveServiceCategory { constructor(private readonly o: ServiceCatalogOperations) {} execute(c: ServiceCatalogContext, id: string) { return this.o.archiveCategory(c, id) } }
export class RestoreServiceCategory { constructor(private readonly o: ServiceCatalogOperations) {} execute(c: ServiceCatalogContext, id: string) { return this.o.restoreCategory(c, id) } }
export class CreateService { constructor(private readonly o: ServiceCatalogOperations) {} execute(c: ServiceCatalogContext, i: CreateServiceRequest) { return this.o.createService(c, i) } }
export class UpdateService { constructor(private readonly o: ServiceCatalogOperations) {} execute(c: ServiceCatalogContext, id: string, i: UpdateServiceRequest) { return this.o.updateService(c, id, i) } }
export class GetService { constructor(private readonly o: ServiceCatalogOperations) {} execute(c: ServiceCatalogContext, id: string) { return this.o.getService(c, id) } }
export class GetServiceList { constructor(private readonly o: ServiceCatalogOperations) {} execute(c: ServiceCatalogContext, q: ServiceListQuery) { return this.o.listServices(c, q) } }
export class SearchService extends GetServiceList {}
export class ArchiveService { constructor(private readonly o: ServiceCatalogOperations) {} execute(c: ServiceCatalogContext, id: string) { return this.o.archiveService(c, id) } }
export class RestoreService { constructor(private readonly o: ServiceCatalogOperations) {} execute(c: ServiceCatalogContext, id: string) { return this.o.restoreService(c, id) } }
export class EnableServiceForBranch { constructor(private readonly o: ServiceCatalogOperations) {} execute(c: ServiceCatalogContext, id: string, i: EnableBranchServiceRequest) { return this.o.enableBranchService(c, id, i) } }
export class UpdateBranchService { constructor(private readonly o: ServiceCatalogOperations) {} execute(c: ServiceCatalogContext, id: string, b: string, i: UpdateBranchServiceRequest) { return this.o.updateBranchService(c, id, b, i) } }
export class DisableServiceForBranch { constructor(private readonly o: ServiceCatalogOperations) {} execute(c: ServiceCatalogContext, id: string, b: string) { return this.o.disableBranchService(c, id, b) } }
export class GetBranchServiceList { constructor(private readonly o: ServiceCatalogOperations) {} execute(c: ServiceCatalogContext, id: string, q: CatalogListQuery) { return this.o.listBranchServices(c, id, q) } }
export class CreateSkill { constructor(private readonly o: ServiceCatalogOperations) {} execute(c: ServiceCatalogContext, i: CreateSkillRequest) { return this.o.createSkill(c, i) } }
export class UpdateSkill { constructor(private readonly o: ServiceCatalogOperations) {} execute(c: ServiceCatalogContext, id: string, i: UpdateSkillRequest) { return this.o.updateSkill(c, id, i) } }
export class GetSkill { constructor(private readonly o: ServiceCatalogOperations) {} execute(c: ServiceCatalogContext, id: string) { return this.o.getSkill(c, id) } }
export class GetSkillList { constructor(private readonly o: ServiceCatalogOperations) {} execute(c: ServiceCatalogContext, q: CatalogListQuery) { return this.o.listSkills(c, q) } }
export class SearchSkill extends GetSkillList {}
export class ArchiveSkill { constructor(private readonly o: ServiceCatalogOperations) {} execute(c: ServiceCatalogContext, id: string) { return this.o.archiveSkill(c, id) } }
export class RestoreSkill { constructor(private readonly o: ServiceCatalogOperations) {} execute(c: ServiceCatalogContext, id: string) { return this.o.restoreSkill(c, id) } }
export class AssignSkillToService { constructor(private readonly o: ServiceCatalogOperations) {} execute(c: ServiceCatalogContext, id: string, i: AssignServiceSkillRequest) { return this.o.assignServiceSkill(c, id, i) } }
export class RemoveSkillFromService { constructor(private readonly o: ServiceCatalogOperations) {} execute(c: ServiceCatalogContext, id: string, s: string) { return this.o.removeServiceSkill(c, id, s) } }
export class GetServiceRequiredSkills { constructor(private readonly o: ServiceCatalogOperations) {} execute(c: ServiceCatalogContext, id: string) { return this.o.getServiceSkills(c, id) } }
