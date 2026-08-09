import { z } from 'zod'

const uuid = z.string().uuid()
const instant = z.string().datetime({ offset: true })
const periodFields = { dateFrom: instant.optional(), dateTo: instant.optional() }
const reason = z.string().trim().min(1).max(500)

export const bookingCommissionParamsSchema = z.object({ bookingId: uuid })
export const employeeCommissionParamsSchema = z.object({ employeeId: uuid })
export const commissionParamsSchema = z.object({ commissionId: uuid })
export const refundCommissionParamsSchema = z.object({ refundId: uuid })
export const branchCommissionParamsSchema = z.object({ branchId: uuid })

export const optionalPeriodSchema = z.object(periodFields).superRefine((value, context) => {
  if ((value.dateFrom && !value.dateTo) || (!value.dateFrom && value.dateTo)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'dateFrom and dateTo must be provided together' })
  }
  if (value.dateFrom && value.dateTo && Date.parse(value.dateFrom) >= Date.parse(value.dateTo)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'dateFrom must be before dateTo', path: ['dateFrom'] })
  }
}).default({})
const requiredPeriodObject = z.object({ dateFrom: instant, dateTo: instant })
export const requiredPeriodSchema = requiredPeriodObject.refine(
  (value) => Date.parse(value.dateFrom) < Date.parse(value.dateTo), { message: 'dateFrom must be before dateTo', path: ['dateFrom'] })
export const reasonedPeriodSchema = requiredPeriodObject.extend({ reason }).refine(
  (value) => Date.parse(value.dateFrom) < Date.parse(value.dateTo), { message: 'dateFrom must be before dateTo', path: ['dateFrom'] })
export const recalculationSchema = z.object(periodFields).extend({ reason }).superRefine((value, context) => {
  if ((value.dateFrom && !value.dateTo) || (!value.dateFrom && value.dateTo)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'dateFrom and dateTo must be provided together' })
  }
})
export const refundAdjustmentSchema = z.object({ reason: reason.optional() }).default({})
export const legacyRefundAdjustmentSchema = z.object({ refundId: uuid, reason: reason.optional() })

const integer = (fallback: number) => z.preprocess((value) => value === undefined ? fallback : Number(value), z.number().int())
export const commissionListQuerySchema = z.object({
  keyword: z.string().trim().min(1).max(160).optional(), bookingId: uuid.optional(), bookingItemId: uuid.optional(),
  employeeId: uuid.optional(), branchId: uuid.optional(), serviceId: uuid.optional(),
  status: z.enum(['PENDING', 'APPROVED']).optional(), dateFrom: instant.optional(), dateTo: instant.optional(),
  page: integer(1).pipe(z.number().min(1)), pageSize: integer(20).pipe(z.number().min(1).max(100)),
  sort: z.enum(['calculatedAt', 'commissionAmount', 'employeeName', 'serviceName']).default('calculatedAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
}).superRefine((value, context) => {
  if ((value.dateFrom && !value.dateTo) || (!value.dateFrom && value.dateTo)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'dateFrom and dateTo must be provided together' })
  }
})

export interface CommissionPeriodRequest { dateFrom?: string | Date | undefined; dateTo?: string | Date | undefined }
export type CommissionListRequest = z.infer<typeof commissionListQuerySchema>
export type ReasonedPeriodRequest = z.infer<typeof reasonedPeriodSchema>
export type RecalculationRequest = z.infer<typeof recalculationSchema>
export type RefundAdjustmentRequest = z.infer<typeof refundAdjustmentSchema>
export type LegacyRefundAdjustmentRequest = z.infer<typeof legacyRefundAdjustmentSchema>
