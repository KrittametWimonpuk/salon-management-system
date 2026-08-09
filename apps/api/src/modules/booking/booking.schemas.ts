import { z } from 'zod'

const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/, 'Time must use HH:mm:ss')
const notes = (max: number) => z.string().trim().max(max).nullable().optional()
const serviceIds = z.string().transform((value, context) => {
  const values = [...new Set(value.split(',').map((item) => item.trim()).filter(Boolean))]
  if (!values.length || values.some((item) => !z.string().uuid().safeParse(item).success)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'serviceIds must be comma-separated UUIDs' }); return z.NEVER
  }
  return values
})

export const bookingIdParamsSchema = z.object({ id: z.string().uuid() }).strict()
export const bookingItemParamsSchema = z.object({ id: z.string().uuid(), itemId: z.string().uuid() }).strict()

export const availabilityQuerySchema = z.object({ branchId: z.string().uuid(), serviceIds,
  employeeId: z.string().uuid().optional(), date: z.string().date(), startTime: time.optional() }).strict()
export const calendarQuerySchema = z.object({ branchId: z.string().uuid(), date: z.string().date(),
  view: z.enum(['DAY', 'WEEK']).default('DAY'), employeeId: z.string().uuid().optional() }).strict()

const bookingItemInput = z.object({ serviceId: z.string().uuid(), employeeId: z.string().uuid().optional(),
  notes: notes(2_000) }).strict()
export const createBookingSchema = z.object({ customerId: z.string().uuid(),
  source: z.enum(['WALK_IN', 'WEBSITE', 'LINE', 'FACEBOOK', 'PHONE']),
  startsAt: z.string().datetime({ offset: true }), customerNotes: notes(10_000), internalNotes: notes(10_000),
  items: z.array(bookingItemInput).min(1).max(20) }).strict()
export const updateBookingSchema = z.object({ customerNotes: notes(10_000), internalNotes: notes(10_000),
  source: z.enum(['WALK_IN', 'WEBSITE', 'LINE', 'FACEBOOK', 'PHONE']).optional() }).strict()
  .refine((value) => Object.keys(value).length > 0, 'At least one field must be provided')
export const cancelBookingSchema = z.object({ reason: z.string().trim().min(1).max(500) }).strict()
export const rescheduleBookingSchema = z.object({ startsAt: z.string().datetime({ offset: true }),
  reason: z.string().trim().min(1).max(500) }).strict()
export const addBookingItemSchema = bookingItemInput
export const updateBookingItemSchema = z.object({ serviceId: z.string().uuid().optional(),
  employeeId: z.string().uuid().nullable().optional(), notes: notes(2_000) }).strict()
  .refine((value) => Object.keys(value).length > 0, 'At least one field must be provided')

export const bookingListQuerySchema = z.object({ keyword: z.string().trim().min(1).max(160).optional(),
  customerId: z.string().uuid().optional(), employeeId: z.string().uuid().optional(), branchId: z.string().uuid().optional(),
  status: z.enum(['PENDING', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW']).optional(),
  dateFrom: z.string().datetime({ offset: true }).optional(), dateTo: z.string().datetime({ offset: true }).optional(),
  serviceId: z.string().uuid().optional(), page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.enum(['createdAt', 'updatedAt', 'startsAt', 'bookingNumber', 'status']).default('startsAt'),
  order: z.enum(['asc', 'desc']).default('asc') }).strict()
  .refine((value) => !value.dateFrom || !value.dateTo || Date.parse(value.dateTo) > Date.parse(value.dateFrom),
    { message: 'dateTo must be after dateFrom', path: ['dateTo'] })

export type AvailabilityRequest = z.infer<typeof availabilityQuerySchema>
export type CalendarRequest = z.infer<typeof calendarQuerySchema>
export type CreateBookingRequest = z.infer<typeof createBookingSchema>
export type UpdateBookingRequest = z.infer<typeof updateBookingSchema>
export type CancelBookingRequest = z.infer<typeof cancelBookingSchema>
export type RescheduleBookingRequest = z.infer<typeof rescheduleBookingSchema>
export type AddBookingItemRequest = z.infer<typeof addBookingItemSchema>
export type UpdateBookingItemRequest = z.infer<typeof updateBookingItemSchema>
export type BookingListRequest = z.infer<typeof bookingListQuerySchema>
