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
import type { BookingModule } from './booking.module.js'
import { addBookingItemSchema, availabilityQuerySchema, bookingIdParamsSchema, bookingItemParamsSchema,
  bookingListQuerySchema, calendarQuerySchema, cancelBookingSchema, createBookingSchema, rescheduleBookingSchema,
  updateBookingItemSchema, updateBookingSchema, type AddBookingItemRequest, type AvailabilityRequest,
  type BookingListRequest, type CalendarRequest, type CancelBookingRequest, type CreateBookingRequest,
  type RescheduleBookingRequest, type UpdateBookingItemRequest, type UpdateBookingRequest } from './booking.schemas.js'
import { toBookingListQuery } from './booking.use-cases.js'

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
function id(response: Response) { return (response.locals.validatedParams as z.infer<typeof bookingIdParamsSchema>).id }
function meta(page: { page: number; pageSize: number; totalItems: number; totalPages: number }) {
  return { page: page.page, pageSize: page.pageSize, totalItems: page.totalItems, totalPages: page.totalPages }
}

export function createBookingRouter(module: BookingModule, auth: AuthService, tenant: TenantService): Router {
  const router = Router(); router.use(authenticate(auth), resolveBranchContext(tenant, true))
  router.get('/availability', requirePermission('booking.availability.read'), validateQuery(availabilityQuerySchema), asyncHandler(async (req, res) => {
    const input = res.locals.validatedQuery as AvailabilityRequest
    const useCase = input.employeeId ? module.employeeAvailability : module.availability
    sendSuccess(res, unwrapResult(await useCase.execute(context(req), input)))
  }))
  router.get('/calendar', requirePermission('booking.read'), validateQuery(calendarQuerySchema), asyncHandler(async (req, res) => {
    sendSuccess(res, unwrapResult(await module.calendar.execute(context(req), res.locals.validatedQuery as CalendarRequest)))
  }))
  router.post('/', requirePermission('booking.create'), validateBody(createBookingSchema), asyncHandler(async (req, res) => {
    audit(res, req, 'booking.created'); sendSuccess(res, unwrapResult(await module.create.execute(context(req), req.body as CreateBookingRequest)), { statusCode: 201 })
  }))
  router.get('/', requirePermission('booking.read'), validateQuery(bookingListQuerySchema), asyncHandler(async (req, res) => {
    const query = toBookingListQuery(res.locals.validatedQuery as BookingListRequest, req.branchContext!.branchId)
    const useCase = query.keyword || query.customerId || query.employeeId || query.status || query.dateFrom || query.dateTo
      || query.serviceId ? module.search : module.list
    const page = unwrapResult(await useCase.execute(context(req), query)); sendSuccess(res, page.items, { meta: meta(page) })
  }))
  router.get('/:id', requirePermission('booking.read'), validateParams(bookingIdParamsSchema), asyncHandler(async (req, res) => {
    sendSuccess(res, unwrapResult(await module.get.execute(context(req), id(res))))
  }))
  router.patch('/:id', requirePermission('booking.update'), validateParams(bookingIdParamsSchema), validateBody(updateBookingSchema), asyncHandler(async (req, res) => {
    audit(res, req, 'booking.updated'); sendSuccess(res, unwrapResult(await module.update.execute(context(req), id(res), req.body as UpdateBookingRequest)))
  }))
  router.post('/:id/confirm', requirePermission('booking.status.update'), validateParams(bookingIdParamsSchema), asyncHandler(async (req, res) => {
    audit(res, req, 'booking.confirmed'); sendSuccess(res, unwrapResult(await module.confirm.execute(context(req), id(res))))
  }))
  router.post('/:id/check-in', requirePermission('booking.status.update'), validateParams(bookingIdParamsSchema), asyncHandler(async (req, res) => {
    audit(res, req, 'booking.checked_in'); sendSuccess(res, unwrapResult(await module.checkIn.execute(context(req), id(res))))
  }))
  router.post('/:id/start', requirePermission('booking.status.update'), validateParams(bookingIdParamsSchema), asyncHandler(async (req, res) => {
    audit(res, req, 'booking.started'); sendSuccess(res, unwrapResult(await module.start.execute(context(req), id(res))))
  }))
  router.post('/:id/complete', requirePermission('booking.status.update'), validateParams(bookingIdParamsSchema), asyncHandler(async (req, res) => {
    audit(res, req, 'booking.completed'); sendSuccess(res, unwrapResult(await module.complete.execute(context(req), id(res))))
  }))
  router.post('/:id/no-show', requirePermission('booking.status.update'), validateParams(bookingIdParamsSchema), asyncHandler(async (req, res) => {
    audit(res, req, 'booking.no_show'); sendSuccess(res, unwrapResult(await module.noShow.execute(context(req), id(res))))
  }))
  router.post('/:id/cancel', requirePermission('booking.cancel'), validateParams(bookingIdParamsSchema), validateBody(cancelBookingSchema), asyncHandler(async (req, res) => {
    audit(res, req, 'booking.cancelled'); sendSuccess(res, unwrapResult(await module.cancel.execute(context(req), id(res), req.body as CancelBookingRequest)))
  }))
  router.post('/:id/reschedule', requirePermission('booking.reschedule'), validateParams(bookingIdParamsSchema), validateBody(rescheduleBookingSchema), asyncHandler(async (req, res) => {
    audit(res, req, 'booking.rescheduled'); sendSuccess(res, unwrapResult(await module.reschedule.execute(context(req), id(res), req.body as RescheduleBookingRequest)))
  }))
  router.post('/:id/items', requirePermission('booking.item.manage'), validateParams(bookingIdParamsSchema), validateBody(addBookingItemSchema), asyncHandler(async (req, res) => {
    audit(res, req, 'booking_item.added'); sendSuccess(res, unwrapResult(await module.addItem.execute(context(req), id(res), req.body as AddBookingItemRequest)), { statusCode: 201 })
  }))
  router.patch('/:id/items/:itemId', requirePermission('booking.item.manage'), validateParams(bookingItemParamsSchema), validateBody(updateBookingItemSchema), asyncHandler(async (req, res) => {
    audit(res, req, 'booking_item.updated'); const p = res.locals.validatedParams as z.infer<typeof bookingItemParamsSchema>
    sendSuccess(res, unwrapResult(await module.updateItem.execute(context(req), p.id, p.itemId, req.body as UpdateBookingItemRequest)))
  }))
  router.delete('/:id/items/:itemId', requirePermission('booking.item.manage'), validateParams(bookingItemParamsSchema), asyncHandler(async (req, res) => {
    audit(res, req, 'booking_item.removed'); const p = res.locals.validatedParams as z.infer<typeof bookingItemParamsSchema>
    sendSuccess(res, unwrapResult(await module.removeItem.execute(context(req), p.id, p.itemId)))
  }))
  return router
}
