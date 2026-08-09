import { Router, type Response } from 'express'
import { z } from 'zod'
import type { CustomerListQuery } from '../../application/foundation/repositories.js'
import type { PolicySubject } from '../../application/foundation/policy.js'
import { unwrapResult } from '../../shared/http/domain-result.js'
import { sendSuccess } from '../../shared/http/response.js'
import { asyncHandler } from '../../shared/middleware/async-handler.js'
import { validateBody, validateParams, validateQuery } from '../../shared/middleware/validate.js'
import type { AuthService } from '../auth/auth.service.js'
import { authenticate } from '../auth/auth.middleware.js'
import type { TenantService } from '../tenant/tenant.service.js'
import { resolveBranchContext } from '../tenant/tenant.middleware.js'
import type { CustomerModule } from './customer.module.js'
import {
  assignCustomerTagSchema,
  createCustomerSchema,
  customerIdParamsSchema,
  customerListQuerySchema,
  customerTagParamsSchema,
  updateCustomerSchema,
  type CreateCustomerRequest,
  type CustomerListRequest,
  type UpdateCustomerRequest,
} from './customer.schemas.js'

function context(request: Express.Request) {
  const principal = request.principal!
  const permissions = request.branchContext?.permissions
    ?? principal.grants.filter((grant) => grant.branchId === null).flatMap((grant) => grant.permissions)
  const subject: PolicySubject = {
    userId: principal.userId,
    organizationId: principal.organizationId,
    branchIds: new Set(request.branchContext ? [request.branchContext.branchId] : []),
    permissions: new Set(permissions),
  }
  return {
    subject,
    ...(request.branchContext ? { branchId: request.branchContext.branchId } : {}),
  }
}

function setAudit(response: Response, request: Express.Request, action: string): void {
  response.locals.auditContext = {
    organizationId: request.principal!.organizationId,
    userId: request.principal!.userId,
    ...(request.branchContext ? { branchId: request.branchContext.branchId } : {}),
    action,
  }
}

function toListQuery(query: CustomerListRequest): CustomerListQuery {
  const tagIsId = query.tag ? z.string().uuid().safeParse(query.tag).success : false
  return {
    status: query.status,
    page: query.page,
    pageSize: query.pageSize,
    sort: query.sort,
    order: query.order,
    ...(query.keyword ? { keyword: query.keyword } : {}),
    ...(query.tag && tagIsId ? { tagId: query.tag } : {}),
    ...(query.tag && !tagIsId ? { tagName: query.tag } : {}),
  }
}

export function createCustomerRouter(
  module: CustomerModule,
  authService: AuthService,
  tenantService: TenantService,
): Router {
  const router = Router()
  router.use(authenticate(authService), resolveBranchContext(tenantService, false))

  router.post('/', validateBody(createCustomerSchema), asyncHandler(async (request, response) => {
    setAudit(response, request, 'customer.create')
    const customer = unwrapResult(await module.create.execute(context(request), request.body as CreateCustomerRequest))
    sendSuccess(response, customer, { statusCode: 201 })
  }))

  router.get('/', validateQuery(customerListQuerySchema), asyncHandler(async (request, response) => {
    const query = response.locals.validatedQuery as CustomerListRequest
    const useCase = query.keyword || query.tag || query.status !== 'ACTIVE' ? module.search : module.list
    const page = unwrapResult(await useCase.execute(context(request), toListQuery(query)))
    sendSuccess(response, page.items, {
      meta: { page: page.page, pageSize: page.pageSize, totalItems: page.totalItems, totalPages: page.totalPages },
    })
  }))

  router.get('/:id', validateParams(customerIdParamsSchema), asyncHandler(async (request, response) => {
    const { id } = response.locals.validatedParams as z.infer<typeof customerIdParamsSchema>
    sendSuccess(response, unwrapResult(await module.get.execute(context(request), id)))
  }))

  router.patch('/:id', validateParams(customerIdParamsSchema), validateBody(updateCustomerSchema), asyncHandler(async (request, response) => {
    setAudit(response, request, 'customer.update')
    const { id } = response.locals.validatedParams as z.infer<typeof customerIdParamsSchema>
    sendSuccess(response, unwrapResult(await module.update.execute(context(request), id, request.body as UpdateCustomerRequest)))
  }))

  router.post('/:id/archive', validateParams(customerIdParamsSchema), asyncHandler(async (request, response) => {
    setAudit(response, request, 'customer.archive')
    const { id } = response.locals.validatedParams as z.infer<typeof customerIdParamsSchema>
    sendSuccess(response, unwrapResult(await module.archive.execute(context(request), id)))
  }))

  router.post('/:id/restore', validateParams(customerIdParamsSchema), asyncHandler(async (request, response) => {
    setAudit(response, request, 'customer.restore')
    const { id } = response.locals.validatedParams as z.infer<typeof customerIdParamsSchema>
    sendSuccess(response, unwrapResult(await module.restore.execute(context(request), id)))
  }))

  router.post('/:id/tags', validateParams(customerIdParamsSchema), validateBody(assignCustomerTagSchema), asyncHandler(async (request, response) => {
    setAudit(response, request, 'customer.tag.assign')
    const { id } = response.locals.validatedParams as z.infer<typeof customerIdParamsSchema>
    const { tagId } = request.body as z.infer<typeof assignCustomerTagSchema>
    sendSuccess(response, unwrapResult(await module.assignTag.execute(context(request), id, tagId)), { statusCode: 201 })
  }))

  router.delete('/:id/tags/:tagId', validateParams(customerTagParamsSchema), asyncHandler(async (request, response) => {
    setAudit(response, request, 'customer.tag.remove')
    const { id, tagId } = response.locals.validatedParams as z.infer<typeof customerTagParamsSchema>
    sendSuccess(response, unwrapResult(await module.removeTag.execute(context(request), id, tagId)))
  }))

  return router
}
