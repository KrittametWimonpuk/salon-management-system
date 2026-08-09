import { Router, type Request, type Response } from 'express'
import type { z } from 'zod'
import type { EmployeeListQuery } from '../../application/foundation/repositories.js'
import type { PolicySubject } from '../../application/foundation/policy.js'
import { unwrapResult } from '../../shared/http/domain-result.js'
import { sendSuccess } from '../../shared/http/response.js'
import { asyncHandler } from '../../shared/middleware/async-handler.js'
import { validateBody, validateParams, validateQuery } from '../../shared/middleware/validate.js'
import type { AuthService } from '../auth/auth.service.js'
import { authenticate } from '../auth/auth.middleware.js'
import { requirePermission } from '../rbac/permission.middleware.js'
import type { TenantService } from '../tenant/tenant.service.js'
import { resolveBranchContext } from '../tenant/tenant.middleware.js'
import type { EmployeeModule } from './employee.module.js'
import { assignBranchSchema, assignSkillSchema, createEmployeeSchema, createTimeOffSchema,
  employeeBranchParamsSchema, employeeIdParamsSchema, employeeListQuerySchema, employeeSkillParamsSchema,
  timeOffParamsSchema, updateEmployeeSchema, updateWorkingHourSchema, workingHourParamsSchema,
  workingHourSchema, type AssignSkillRequest, type CreateEmployeeRequest, type CreateTimeOffRequest,
  type EmployeeListRequest, type UpdateEmployeeRequest, type UpdateWorkingHourRequest,
  type WorkingHourRequest } from './employee.schemas.js'

function context(request: Request) {
  const principal = request.principal!
  const branch = request.branchContext!
  const subject: PolicySubject = { userId: principal.userId, organizationId: principal.organizationId,
    branchIds: new Set([branch.branchId]), permissions: new Set(branch.permissions) }
  return { subject, branchId: branch.branchId, organizationWide: principal.grants.some((grant) => grant.branchId === null) }
}

function audit(response: Response, request: Request, action: string): void {
  response.locals.auditContext = { organizationId: request.principal!.organizationId,
    userId: request.principal!.userId, branchId: request.branchContext!.branchId, action }
}

function listQuery(input: EmployeeListRequest): EmployeeListQuery {
  return { status: input.status, page: input.page, pageSize: input.pageSize, sort: input.sort, order: input.order,
    ...(input.keyword ? { keyword: input.keyword } : {}), ...(input.branchId ? { branchId: input.branchId } : {}),
    ...(input.skillId ? { skillId: input.skillId } : {}) }
}

export function createEmployeeRouter(module: EmployeeModule, auth: AuthService, tenant: TenantService): Router {
  const router = Router()
  router.use(authenticate(auth), resolveBranchContext(tenant, true))
  router.post('/', requirePermission('employee.create'), validateBody(createEmployeeSchema), asyncHandler(async (req, res) => {
    audit(res, req, 'employee.created'); sendSuccess(res, unwrapResult(await module.create.execute(context(req), req.body as CreateEmployeeRequest)), { statusCode: 201 })
  }))
  router.get('/', requirePermission('employee.read'), validateQuery(employeeListQuerySchema), asyncHandler(async (req, res) => {
    const query = res.locals.validatedQuery as EmployeeListRequest
    const useCase = query.keyword || query.skillId || query.status !== 'ACTIVE' ? module.search : module.list
    const page = unwrapResult(await useCase.execute(context(req), listQuery(query)))
    sendSuccess(res, page.items, { meta: { page: page.page, pageSize: page.pageSize, totalItems: page.totalItems, totalPages: page.totalPages } })
  }))
  router.get('/:id', requirePermission('employee.read'), validateParams(employeeIdParamsSchema), asyncHandler(async (req, res) => {
    const { id } = res.locals.validatedParams as z.infer<typeof employeeIdParamsSchema>
    sendSuccess(res, unwrapResult(await module.get.execute(context(req), id)))
  }))
  router.patch('/:id', requirePermission('employee.update'), validateParams(employeeIdParamsSchema), validateBody(updateEmployeeSchema), asyncHandler(async (req, res) => {
    audit(res, req, 'employee.updated'); const { id } = res.locals.validatedParams as z.infer<typeof employeeIdParamsSchema>
    sendSuccess(res, unwrapResult(await module.update.execute(context(req), id, req.body as UpdateEmployeeRequest)))
  }))
  router.post('/:id/archive', requirePermission('employee.archive'), validateParams(employeeIdParamsSchema), asyncHandler(async (req, res) => {
    audit(res, req, 'employee.archived'); const { id } = res.locals.validatedParams as z.infer<typeof employeeIdParamsSchema>
    sendSuccess(res, unwrapResult(await module.archive.execute(context(req), id)))
  }))
  router.post('/:id/restore', requirePermission('employee.restore'), validateParams(employeeIdParamsSchema), asyncHandler(async (req, res) => {
    audit(res, req, 'employee.restored'); const { id } = res.locals.validatedParams as z.infer<typeof employeeIdParamsSchema>
    sendSuccess(res, unwrapResult(await module.restore.execute(context(req), id)))
  }))
  router.post('/:id/branches', requirePermission('employee.branch.manage'), validateParams(employeeIdParamsSchema), validateBody(assignBranchSchema), asyncHandler(async (req, res) => {
    audit(res, req, 'employee.branch.assigned'); const { id } = res.locals.validatedParams as z.infer<typeof employeeIdParamsSchema>
    const { branchId } = req.body as z.infer<typeof assignBranchSchema>; sendSuccess(res, unwrapResult(await module.assignBranch.execute(context(req), id, branchId)), { statusCode: 201 })
  }))
  router.delete('/:id/branches/:branchId', requirePermission('employee.branch.manage'), validateParams(employeeBranchParamsSchema), asyncHandler(async (req, res) => {
    audit(res, req, 'employee.branch.removed'); const { id, branchId } = res.locals.validatedParams as z.infer<typeof employeeBranchParamsSchema>
    sendSuccess(res, unwrapResult(await module.removeBranch.execute(context(req), id, branchId)))
  }))
  router.post('/:id/branches/:branchId/primary', requirePermission('employee.branch.manage'), validateParams(employeeBranchParamsSchema), asyncHandler(async (req, res) => {
    audit(res, req, 'employee.branch.primary_changed'); const { id, branchId } = res.locals.validatedParams as z.infer<typeof employeeBranchParamsSchema>
    sendSuccess(res, unwrapResult(await module.setPrimaryBranch.execute(context(req), id, branchId)))
  }))
  router.post('/:id/skills', requirePermission('employee.skill.manage'), validateParams(employeeIdParamsSchema), validateBody(assignSkillSchema), asyncHandler(async (req, res) => {
    audit(res, req, 'employee.skill.assigned'); const { id } = res.locals.validatedParams as z.infer<typeof employeeIdParamsSchema>
    sendSuccess(res, unwrapResult(await module.assignSkill.execute(context(req), id, req.body as AssignSkillRequest)), { statusCode: 201 })
  }))
  router.delete('/:id/skills/:skillId', requirePermission('employee.skill.manage'), validateParams(employeeSkillParamsSchema), asyncHandler(async (req, res) => {
    audit(res, req, 'employee.skill.removed'); const { id, skillId } = res.locals.validatedParams as z.infer<typeof employeeSkillParamsSchema>
    sendSuccess(res, unwrapResult(await module.removeSkill.execute(context(req), id, skillId)))
  }))
  router.post('/:id/working-hours', requirePermission('employee.schedule.manage'), validateParams(employeeIdParamsSchema), validateBody(workingHourSchema), asyncHandler(async (req, res) => {
    audit(res, req, 'employee.working_hour.set'); const { id } = res.locals.validatedParams as z.infer<typeof employeeIdParamsSchema>
    sendSuccess(res, unwrapResult(await module.setWorkingHour.execute(context(req), id, req.body as WorkingHourRequest)), { statusCode: 201 })
  }))
  router.patch('/:id/working-hours/:workingHourId', requirePermission('employee.schedule.manage'), validateParams(workingHourParamsSchema), validateBody(updateWorkingHourSchema), asyncHandler(async (req, res) => {
    audit(res, req, 'employee.working_hour.updated'); const { id, workingHourId } = res.locals.validatedParams as z.infer<typeof workingHourParamsSchema>
    sendSuccess(res, unwrapResult(await module.updateWorkingHour.execute(context(req), id, workingHourId, req.body as UpdateWorkingHourRequest)))
  }))
  router.delete('/:id/working-hours/:workingHourId', requirePermission('employee.schedule.manage'), validateParams(workingHourParamsSchema), asyncHandler(async (req, res) => {
    audit(res, req, 'employee.working_hour.removed'); const { id, workingHourId } = res.locals.validatedParams as z.infer<typeof workingHourParamsSchema>
    sendSuccess(res, unwrapResult(await module.removeWorkingHour.execute(context(req), id, workingHourId)))
  }))
  router.post('/:id/time-off', requirePermission('employee.schedule.manage'), validateParams(employeeIdParamsSchema), validateBody(createTimeOffSchema), asyncHandler(async (req, res) => {
    audit(res, req, 'employee.time_off.created'); const { id } = res.locals.validatedParams as z.infer<typeof employeeIdParamsSchema>
    sendSuccess(res, unwrapResult(await module.createTimeOff.execute(context(req), id, req.body as CreateTimeOffRequest)), { statusCode: 201 })
  }))
  router.post('/:id/time-off/:timeOffId/cancel', requirePermission('employee.schedule.manage'), validateParams(timeOffParamsSchema), asyncHandler(async (req, res) => {
    audit(res, req, 'employee.time_off.cancelled'); const { id, timeOffId } = res.locals.validatedParams as z.infer<typeof timeOffParamsSchema>
    sendSuccess(res, unwrapResult(await module.cancelTimeOff.execute(context(req), id, timeOffId)))
  }))
  return router
}
