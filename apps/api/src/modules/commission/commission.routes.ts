import { Router, type Request, type Response } from 'express'
import type { z } from 'zod'
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
import type { CommissionModule } from './commission.module.js'
import { bookingCommissionParamsSchema, commissionListQuerySchema, commissionParamsSchema,
  employeeCommissionParamsSchema, legacyRefundAdjustmentSchema, optionalPeriodSchema, recalculationSchema,
  refundAdjustmentSchema, refundCommissionParamsSchema, requiredPeriodSchema, reasonedPeriodSchema,
  type CommissionListRequest, type CommissionPeriodRequest, type LegacyRefundAdjustmentRequest,
  type RecalculationRequest, type RefundAdjustmentRequest, type ReasonedPeriodRequest } from './commission.schemas.js'
import { toCommissionListQuery } from './commission.use-cases.js'

function context(request: Request) {
  const principal = request.principal!; const branch = request.branchContext!
  const subject: PolicySubject = { userId: principal.userId, organizationId: principal.organizationId,
    branchIds: new Set([branch.branchId]), permissions: new Set(branch.permissions) }
  return { subject, branchId: branch.branchId }
}
function audit(response: Response, request: Request, action: string) {
  response.locals.auditContext = { organizationId: request.principal!.organizationId,
    userId: request.principal!.userId, branchId: request.branchContext!.branchId, action }
}
function params<T extends z.ZodTypeAny>(response: Response) { return response.locals.validatedParams as z.infer<T> }
function meta(page: { page: number; pageSize: number; totalItems: number; totalPages: number }) {
  return { page: page.page, pageSize: page.pageSize, totalItems: page.totalItems, totalPages: page.totalPages }
}

export function createCommissionRouter(module: CommissionModule, auth: AuthService, tenant: TenantService): Router {
  const router = Router(); router.use(authenticate(auth), resolveBranchContext(tenant, true))
  router.post('/preview-period', requirePermission('commission.preview'), validateBody(requiredPeriodSchema),
    asyncHandler(async (req, res) => sendSuccess(res, unwrapResult(await module.previewPeriod.execute(context(req),
      req.body as CommissionPeriodRequest)))))
  router.post('/calculate-period', requirePermission('commission.calculate'), validateBody(requiredPeriodSchema),
    asyncHandler(async (req, res) => { audit(res, req, 'commission.period.calculated')
      sendSuccess(res, unwrapResult(await module.calculatePeriod.execute(context(req),
        req.body as CommissionPeriodRequest)), { statusCode: 201 }) }))
  router.post('/lock-period', requirePermission('commission.lock'), validateBody(reasonedPeriodSchema),
    asyncHandler(async (req, res) => { audit(res, req, 'commission.period.locked')
      sendSuccess(res, unwrapResult(await module.lockPeriod.execute(context(req), req.body as ReasonedPeriodRequest))) }))
  router.get('/period-status', requirePermission('commission.read'), validateQuery(requiredPeriodSchema),
    asyncHandler(async (req, res) => sendSuccess(res, unwrapResult(await module.periodStatus.execute(context(req),
      res.locals.validatedQuery as CommissionPeriodRequest)))))
  router.get('/summary', requirePermission('commission.summary.read'), validateQuery(requiredPeriodSchema),
    asyncHandler(async (req, res) => sendSuccess(res, unwrapResult(await module.summary.execute(context(req),
      res.locals.validatedQuery as CommissionPeriodRequest)))))
  router.post('/refunds/:refundId/adjust', requirePermission('commission.adjust'), validateParams(refundCommissionParamsSchema),
    validateBody(refundAdjustmentSchema), asyncHandler(async (req, res) => { audit(res, req, 'commission.adjustment.applied')
      const id = params<typeof refundCommissionParamsSchema>(res).refundId; const body = req.body as RefundAdjustmentRequest
      sendSuccess(res, unwrapResult(await module.adjustRefund.execute(context(req), id, body.reason)), { statusCode: 201 }) }))
  router.get('/', requirePermission('commission.read'), validateQuery(commissionListQuerySchema), asyncHandler(async (req, res) => {
    const query = toCommissionListQuery(res.locals.validatedQuery as CommissionListRequest, req.branchContext!.branchId)
    const page = unwrapResult(await module.list.execute(context(req), query)); sendSuccess(res, page.items, { meta: meta(page) })
  }))
  router.post('/:commissionId/adjust', requirePermission('commission.adjust'), validateParams(commissionParamsSchema),
    validateBody(legacyRefundAdjustmentSchema), asyncHandler(async (req, res) => { audit(res, req, 'commission.adjustment.applied')
      const body = req.body as LegacyRefundAdjustmentRequest
      sendSuccess(res, unwrapResult(await module.adjustRefund.execute(context(req), body.refundId, body.reason)), { statusCode: 201 }) }))
  router.post('/:commissionId/approve', requirePermission('commission.approve'), validateParams(commissionParamsSchema),
    validateBody(reasonedPeriodSchema), asyncHandler(async (req, res) => { audit(res, req, 'commission.approved')
      sendSuccess(res, unwrapResult(await module.approve.execute(context(req),
        params<typeof commissionParamsSchema>(res).commissionId, req.body as ReasonedPeriodRequest)), { statusCode: 201 }) }))
  router.get('/:commissionId', requirePermission('commission.read'), validateParams(commissionParamsSchema),
    asyncHandler(async (req, res) => sendSuccess(res, unwrapResult(await module.get.execute(context(req),
      params<typeof commissionParamsSchema>(res).commissionId)))))
  return router
}

export function createBookingCommissionRouter(module: CommissionModule, auth: AuthService, tenant: TenantService): Router {
  const router = Router(); router.use(authenticate(auth), resolveBranchContext(tenant, true))
  router.post('/:bookingId/commissions/preview', requirePermission('commission.preview'),
    validateParams(bookingCommissionParamsSchema), validateBody(optionalPeriodSchema), asyncHandler(async (req, res) =>
      sendSuccess(res, unwrapResult(await module.previewBooking.execute(context(req),
        params<typeof bookingCommissionParamsSchema>(res).bookingId, req.body as CommissionPeriodRequest)))))
  router.post('/:bookingId/commissions/calculate', requirePermission('commission.calculate'),
    validateParams(bookingCommissionParamsSchema), validateBody(optionalPeriodSchema), asyncHandler(async (req, res) => {
      audit(res, req, 'commission.booking.calculated'); sendSuccess(res, unwrapResult(await module.calculateBooking.execute(
        context(req), params<typeof bookingCommissionParamsSchema>(res).bookingId,
        req.body as CommissionPeriodRequest)), { statusCode: 201 }) }))
  router.post('/:bookingId/commissions/recalculate', requirePermission('commission.recalculate'),
    validateParams(bookingCommissionParamsSchema), validateBody(recalculationSchema), asyncHandler(async (req, res) => {
      audit(res, req, 'commission.recalculated'); sendSuccess(res, unwrapResult(await module.recalculate.execute(context(req),
        params<typeof bookingCommissionParamsSchema>(res).bookingId, req.body as RecalculationRequest)), { statusCode: 201 }) }))
  router.get('/:bookingId/commissions', requirePermission('commission.read'), validateParams(bookingCommissionParamsSchema),
    asyncHandler(async (req, res) => sendSuccess(res, unwrapResult(await module.bookingHistory.execute(context(req),
      params<typeof bookingCommissionParamsSchema>(res).bookingId)))))
  return router
}

export function createEmployeeCommissionRouter(module: CommissionModule, auth: AuthService, tenant: TenantService): Router {
  const router = Router(); router.use(authenticate(auth), resolveBranchContext(tenant, true))
  router.post('/:employeeId/commissions/preview', requirePermission('commission.preview'),
    validateParams(employeeCommissionParamsSchema), validateBody(requiredPeriodSchema), asyncHandler(async (req, res) =>
      sendSuccess(res, unwrapResult(await module.previewEmployee.execute(context(req),
        params<typeof employeeCommissionParamsSchema>(res).employeeId, req.body as CommissionPeriodRequest)))))
  router.post('/:employeeId/commissions/calculate', requirePermission('commission.calculate'),
    validateParams(employeeCommissionParamsSchema), validateBody(requiredPeriodSchema), asyncHandler(async (req, res) => {
      audit(res, req, 'commission.employee.calculated'); sendSuccess(res, unwrapResult(await module.calculateEmployee.execute(
        context(req), params<typeof employeeCommissionParamsSchema>(res).employeeId,
        req.body as CommissionPeriodRequest)), { statusCode: 201 }) }))
  router.get('/:employeeId/commissions/summary', requirePermission('commission.summary.read'),
    validateParams(employeeCommissionParamsSchema), validateQuery(requiredPeriodSchema), asyncHandler(async (req, res) =>
      sendSuccess(res, unwrapResult(await module.employeeSummary.execute(context(req),
        params<typeof employeeCommissionParamsSchema>(res).employeeId,
        res.locals.validatedQuery as CommissionPeriodRequest)))))
  router.get('/:employeeId/commissions', requirePermission('commission.read'), validateParams(employeeCommissionParamsSchema),
    validateQuery(optionalPeriodSchema), asyncHandler(async (req, res) => sendSuccess(res,
      unwrapResult(await module.employeeHistory.execute(context(req), params<typeof employeeCommissionParamsSchema>(res).employeeId,
        res.locals.validatedQuery as CommissionPeriodRequest)))))
  return router
}
