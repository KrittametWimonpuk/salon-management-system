import { Router, type Request, type Response } from 'express'
import type { z } from 'zod'
import type { CatalogListQuery, ServiceListQuery } from '../../application/foundation/repositories.js'
import type { PolicySubject } from '../../application/foundation/policy.js'
import { unwrapResult } from '../../shared/http/domain-result.js'
import { sendSuccess } from '../../shared/http/response.js'
import { asyncHandler } from '../../shared/middleware/async-handler.js'
import { validateBody, validateParams, validateQuery } from '../../shared/middleware/validate.js'
import { authenticate } from '../auth/auth.middleware.js'
import type { AuthService } from '../auth/auth.service.js'
import { requirePermission } from '../rbac/permission.middleware.js'
import { resolveBranchContext } from '../tenant/tenant.middleware.js'
import type { TenantService } from '../tenant/tenant.service.js'
import type { ServiceCatalogModule } from './service-catalog.module.js'
import { assignServiceSkillSchema, branchServiceListQuerySchema, branchServiceParamsSchema, catalogIdParamsSchema,
  createServiceCategorySchema, createServiceSchema, createSkillSchema, enableBranchServiceSchema,
  serviceCategoryListQuerySchema, serviceListQuerySchema, serviceSkillParamsSchema, skillListQuerySchema,
  updateBranchServiceSchema, updateServiceCategorySchema, updateServiceSchema, updateSkillSchema,
  type AssignServiceSkillRequest, type CatalogListRequest, type CreateServiceCategoryRequest,
  type CreateServiceRequest, type CreateSkillRequest, type EnableBranchServiceRequest,
  type ServiceListRequest, type UpdateBranchServiceRequest, type UpdateServiceCategoryRequest,
  type UpdateServiceRequest, type UpdateSkillRequest } from './service-catalog.schemas.js'

function context(request: Request, branchScoped = false) {
  const principal = request.principal!
  const branch = branchScoped ? request.branchContext : undefined
  const permissions = branch?.permissions
    ?? principal.grants.filter((grant) => grant.branchId === null).flatMap((grant) => grant.permissions)
  const subject: PolicySubject = { userId: principal.userId, organizationId: principal.organizationId,
    branchIds: new Set(branch ? [branch.branchId] : []), permissions: new Set(permissions) }
  return { subject, ...(branch ? { branchId: branch.branchId } : {}) }
}

function audit(response: Response, request: Request, action: string): void {
  response.locals.auditContext = { organizationId: request.principal!.organizationId,
    userId: request.principal!.userId, ...(request.branchContext ? { branchId: request.branchContext.branchId } : {}), action }
}

function catalogQuery(input: CatalogListRequest): CatalogListQuery {
  return { status: input.status, page: input.page, pageSize: input.pageSize,
    sort: input.sort, order: input.order, ...(input.keyword ? { keyword: input.keyword } : {}) }
}

function serviceQuery(input: ServiceListRequest): ServiceListQuery {
  return { status: input.status, page: input.page, pageSize: input.pageSize, sort: input.sort, order: input.order,
    ...(input.keyword ? { keyword: input.keyword } : {}), ...(input.categoryId ? { categoryId: input.categoryId } : {}),
    ...(input.branchId ? { branchId: input.branchId } : {}), ...(input.skillId ? { skillId: input.skillId } : {}) }
}

function common(auth: AuthService, tenant: TenantService) {
  return [authenticate(auth), resolveBranchContext(tenant, false)] as const
}

export function createServiceCategoryRouter(module: ServiceCatalogModule, auth: AuthService, tenant: TenantService): Router {
  const router = Router(); router.use(...common(auth, tenant))
  router.post('/', requirePermission('service.category.manage'), validateBody(createServiceCategorySchema), asyncHandler(async (req, res) => {
    audit(res, req, 'service_category.created'); sendSuccess(res, unwrapResult(await module.createCategory.execute(context(req), req.body as CreateServiceCategoryRequest)), { statusCode: 201 })
  }))
  router.get('/', requirePermission('service.category.manage'), validateQuery(serviceCategoryListQuerySchema), asyncHandler(async (req, res) => {
    const page = unwrapResult(await module.listCategories.execute(context(req), catalogQuery(res.locals.validatedQuery as CatalogListRequest)))
    sendSuccess(res, page.items, { meta: pageMeta(page) })
  }))
  router.get('/:id', requirePermission('service.category.manage'), validateParams(catalogIdParamsSchema), asyncHandler(async (req, res) => {
    sendSuccess(res, unwrapResult(await module.getCategory.execute(context(req), id(res))))
  }))
  router.patch('/:id', requirePermission('service.category.manage'), validateParams(catalogIdParamsSchema), validateBody(updateServiceCategorySchema), asyncHandler(async (req, res) => {
    audit(res, req, 'service_category.updated'); sendSuccess(res, unwrapResult(await module.updateCategory.execute(context(req), id(res), req.body as UpdateServiceCategoryRequest)))
  }))
  router.post('/:id/archive', requirePermission('service.category.manage'), validateParams(catalogIdParamsSchema), asyncHandler(async (req, res) => {
    audit(res, req, 'service_category.archived'); sendSuccess(res, unwrapResult(await module.archiveCategory.execute(context(req), id(res))))
  }))
  router.post('/:id/restore', requirePermission('service.category.manage'), validateParams(catalogIdParamsSchema), asyncHandler(async (req, res) => {
    audit(res, req, 'service_category.restored'); sendSuccess(res, unwrapResult(await module.restoreCategory.execute(context(req), id(res))))
  }))
  return router
}

export function createServiceRouter(module: ServiceCatalogModule, auth: AuthService, tenant: TenantService): Router {
  const router = Router(); router.use(...common(auth, tenant))
  router.post('/', requirePermission('service.create'), validateBody(createServiceSchema), asyncHandler(async (req, res) => {
    audit(res, req, 'service.created'); sendSuccess(res, unwrapResult(await module.createService.execute(context(req), req.body as CreateServiceRequest)), { statusCode: 201 })
  }))
  router.get('/', requirePermission('service.read'), validateQuery(serviceListQuerySchema), asyncHandler(async (req, res) => {
    const query = serviceQuery(res.locals.validatedQuery as ServiceListRequest)
    const useCase = query.keyword || query.categoryId || query.branchId || query.skillId || query.status !== 'ACTIVE'
      ? module.searchServices : module.listServices
    const page = unwrapResult(await useCase.execute(context(req, Boolean(query.branchId)), query)); sendSuccess(res, page.items, { meta: pageMeta(page) })
  }))
  router.get('/:id', requirePermission('service.read'), validateParams(catalogIdParamsSchema), asyncHandler(async (req, res) => {
    sendSuccess(res, unwrapResult(await module.getService.execute(context(req), id(res))))
  }))
  router.patch('/:id', requirePermission('service.update'), validateParams(catalogIdParamsSchema), validateBody(updateServiceSchema), asyncHandler(async (req, res) => {
    audit(res, req, 'service.updated'); sendSuccess(res, unwrapResult(await module.updateService.execute(context(req), id(res), req.body as UpdateServiceRequest)))
  }))
  router.post('/:id/archive', requirePermission('service.archive'), validateParams(catalogIdParamsSchema), asyncHandler(async (req, res) => {
    audit(res, req, 'service.archived'); sendSuccess(res, unwrapResult(await module.archiveService.execute(context(req), id(res))))
  }))
  router.post('/:id/restore', requirePermission('service.restore'), validateParams(catalogIdParamsSchema), asyncHandler(async (req, res) => {
    audit(res, req, 'service.restored'); sendSuccess(res, unwrapResult(await module.restoreService.execute(context(req), id(res))))
  }))
  router.post('/:id/branches', requirePermission('service.branch.manage'), validateParams(catalogIdParamsSchema), validateBody(enableBranchServiceSchema), asyncHandler(async (req, res) => {
    audit(res, req, 'branch_service.enabled'); sendSuccess(res, unwrapResult(await module.enableBranch.execute(context(req, true), id(res), req.body as EnableBranchServiceRequest)), { statusCode: 201 })
  }))
  router.get('/:id/branches', requirePermission('service.branch.manage'), validateParams(catalogIdParamsSchema), validateQuery(branchServiceListQuerySchema), asyncHandler(async (req, res) => {
    const page = unwrapResult(await module.listBranches.execute(context(req, true), id(res), catalogQuery(res.locals.validatedQuery as CatalogListRequest)))
    sendSuccess(res, page.items, { meta: pageMeta(page) })
  }))
  router.patch('/:id/branches/:branchId', requirePermission('service.branch.manage'), validateParams(branchServiceParamsSchema), validateBody(updateBranchServiceSchema), asyncHandler(async (req, res) => {
    audit(res, req, 'branch_service.updated'); const p = res.locals.validatedParams as z.infer<typeof branchServiceParamsSchema>
    sendSuccess(res, unwrapResult(await module.updateBranch.execute(context(req, true), p.id, p.branchId, req.body as UpdateBranchServiceRequest)))
  }))
  router.delete('/:id/branches/:branchId', requirePermission('service.branch.manage'), validateParams(branchServiceParamsSchema), asyncHandler(async (req, res) => {
    audit(res, req, 'branch_service.disabled'); const p = res.locals.validatedParams as z.infer<typeof branchServiceParamsSchema>
    sendSuccess(res, unwrapResult(await module.disableBranch.execute(context(req, true), p.id, p.branchId)))
  }))
  router.post('/:id/skills', requirePermission('service.skill.manage'), validateParams(catalogIdParamsSchema), validateBody(assignServiceSkillSchema), asyncHandler(async (req, res) => {
    audit(res, req, 'service_skill.assigned'); sendSuccess(res, unwrapResult(await module.assignServiceSkill.execute(context(req), id(res), req.body as AssignServiceSkillRequest)), { statusCode: 201 })
  }))
  router.get('/:id/skills', requirePermission('service.read'), validateParams(catalogIdParamsSchema), asyncHandler(async (req, res) => {
    sendSuccess(res, unwrapResult(await module.getServiceSkills.execute(context(req), id(res))))
  }))
  router.delete('/:id/skills/:skillId', requirePermission('service.skill.manage'), validateParams(serviceSkillParamsSchema), asyncHandler(async (req, res) => {
    audit(res, req, 'service_skill.removed'); const p = res.locals.validatedParams as z.infer<typeof serviceSkillParamsSchema>
    sendSuccess(res, unwrapResult(await module.removeServiceSkill.execute(context(req), p.id, p.skillId)))
  }))
  return router
}

export function createSkillRouter(module: ServiceCatalogModule, auth: AuthService, tenant: TenantService): Router {
  const router = Router(); router.use(...common(auth, tenant))
  router.post('/', requirePermission('skill.create'), validateBody(createSkillSchema), asyncHandler(async (req, res) => {
    audit(res, req, 'skill.created'); sendSuccess(res, unwrapResult(await module.createSkill.execute(context(req), req.body as CreateSkillRequest)), { statusCode: 201 })
  }))
  router.get('/', requirePermission('skill.read'), validateQuery(skillListQuerySchema), asyncHandler(async (req, res) => {
    const query = catalogQuery(res.locals.validatedQuery as CatalogListRequest)
    const useCase = query.keyword || query.status !== 'ACTIVE' ? module.searchSkills : module.listSkills
    const page = unwrapResult(await useCase.execute(context(req), query)); sendSuccess(res, page.items, { meta: pageMeta(page) })
  }))
  router.get('/:id', requirePermission('skill.read'), validateParams(catalogIdParamsSchema), asyncHandler(async (req, res) => {
    sendSuccess(res, unwrapResult(await module.getSkill.execute(context(req), id(res))))
  }))
  router.patch('/:id', requirePermission('skill.update'), validateParams(catalogIdParamsSchema), validateBody(updateSkillSchema), asyncHandler(async (req, res) => {
    audit(res, req, 'skill.updated'); sendSuccess(res, unwrapResult(await module.updateSkill.execute(context(req), id(res), req.body as UpdateSkillRequest)))
  }))
  router.post('/:id/archive', requirePermission('skill.archive'), validateParams(catalogIdParamsSchema), asyncHandler(async (req, res) => {
    audit(res, req, 'skill.archived'); sendSuccess(res, unwrapResult(await module.archiveSkill.execute(context(req), id(res))))
  }))
  router.post('/:id/restore', requirePermission('skill.restore'), validateParams(catalogIdParamsSchema), asyncHandler(async (req, res) => {
    audit(res, req, 'skill.restored'); sendSuccess(res, unwrapResult(await module.restoreSkill.execute(context(req), id(res))))
  }))
  return router
}

function id(response: Response): string {
  return (response.locals.validatedParams as z.infer<typeof catalogIdParamsSchema>).id
}

function pageMeta(value: { page: number; pageSize: number; totalItems: number; totalPages: number }) {
  return { page: value.page, pageSize: value.pageSize, totalItems: value.totalItems, totalPages: value.totalPages }
}
