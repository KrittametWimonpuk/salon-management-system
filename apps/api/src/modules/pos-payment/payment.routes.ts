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
import type { PaymentModule } from './payment.module.js'
import { bookingPaymentParamsSchema, createPaymentSchema, createSplitPaymentSchema, paymentListQuerySchema,
  paymentParamsSchema, refundPaymentSchema, voidPaymentSchema, type CreatePaymentRequest,
  type CreateSplitPaymentRequest, type PaymentListRequest, type RefundPaymentRequest,
  type VoidPaymentRequest } from './payment.schemas.js'
import { toPaymentListQuery } from './payment.use-cases.js'

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
function bookingId(response: Response) {
  return (response.locals.validatedParams as z.infer<typeof bookingPaymentParamsSchema>).bookingId
}
function paymentId(response: Response) {
  return (response.locals.validatedParams as z.infer<typeof paymentParamsSchema>).paymentId
}
function meta(page: { page: number; pageSize: number; totalItems: number; totalPages: number }) {
  return { page: page.page, pageSize: page.pageSize, totalItems: page.totalItems, totalPages: page.totalPages }
}

export function createBookingPaymentRouter(module: PaymentModule, auth: AuthService, tenant: TenantService): Router {
  const router = Router(); router.use(authenticate(auth), resolveBranchContext(tenant, true))
  router.get('/:bookingId/checkout', requirePermission('pos.read'), validateParams(bookingPaymentParamsSchema),
    asyncHandler(async (req, res) => sendSuccess(res, unwrapResult(await module.checkout.execute(context(req), bookingId(res))))))
  router.post('/:bookingId/checkout/validate', requirePermission('payment.checkout'), validateParams(bookingPaymentParamsSchema),
    asyncHandler(async (req, res) => { audit(res, req, 'checkout.validated')
      sendSuccess(res, unwrapResult(await module.validate.execute(context(req), bookingId(res)))) }))
  router.post('/:bookingId/checkout/close-sale', requirePermission('payment.close_sale'), validateParams(bookingPaymentParamsSchema),
    asyncHandler(async (req, res) => { audit(res, req, 'sale.closed')
      sendSuccess(res, unwrapResult(await module.closeSale.execute(context(req), bookingId(res)))) }))
  router.post('/:bookingId/payments/split', requirePermission('payment.create'), validateParams(bookingPaymentParamsSchema),
    validateBody(createSplitPaymentSchema), asyncHandler(async (req, res) => { audit(res, req, 'payment.split_created')
      sendSuccess(res, unwrapResult(await module.split.execute(context(req), bookingId(res),
        req.body as CreateSplitPaymentRequest)), { statusCode: 201 }) }))
  router.post('/:bookingId/payments', requirePermission('payment.create'), validateParams(bookingPaymentParamsSchema),
    validateBody(createPaymentSchema), asyncHandler(async (req, res) => { audit(res, req, 'payment.created')
      sendSuccess(res, unwrapResult(await module.create.execute(context(req), bookingId(res),
        req.body as CreatePaymentRequest)), { statusCode: 201 }) }))
  router.get('/:bookingId/payments', requirePermission('payment.read'), validateParams(bookingPaymentParamsSchema),
    asyncHandler(async (req, res) => sendSuccess(res,
      unwrapResult(await module.bookingPayments.execute(context(req), bookingId(res))))))
  router.get('/:bookingId/receipt', requirePermission('pos.read'), validateParams(bookingPaymentParamsSchema),
    asyncHandler(async (req, res) => { audit(res, req, 'receipt.generated')
      sendSuccess(res, unwrapResult(await module.receipt.execute(context(req), bookingId(res)))) }))
  return router
}

export function createPaymentRouter(module: PaymentModule, auth: AuthService, tenant: TenantService): Router {
  const router = Router(); router.use(authenticate(auth), resolveBranchContext(tenant, true))
  router.get('/', requirePermission('payment.read'), validateQuery(paymentListQuerySchema), asyncHandler(async (req, res) => {
    const query = toPaymentListQuery(res.locals.validatedQuery as PaymentListRequest, req.branchContext!.branchId)
    const page = unwrapResult(await module.list.execute(context(req), query)); sendSuccess(res, page.items, { meta: meta(page) })
  }))
  router.get('/:paymentId', requirePermission('payment.read'), validateParams(paymentParamsSchema),
    asyncHandler(async (req, res) => sendSuccess(res, unwrapResult(await module.get.execute(context(req), paymentId(res))))))
  router.post('/:paymentId/void', requirePermission('payment.void'), validateParams(paymentParamsSchema),
    validateBody(voidPaymentSchema), asyncHandler(async (req, res) => { audit(res, req, 'payment.voided')
      sendSuccess(res, unwrapResult(await module.void.execute(context(req), paymentId(res), req.body as VoidPaymentRequest))) }))
  router.post('/:paymentId/refund', requirePermission('payment.refund'), validateParams(paymentParamsSchema),
    validateBody(refundPaymentSchema), asyncHandler(async (req, res) => { audit(res, req, 'payment.refunded')
      sendSuccess(res, unwrapResult(await module.refund.execute(context(req), paymentId(res), req.body as RefundPaymentRequest))) }))
  return router
}
