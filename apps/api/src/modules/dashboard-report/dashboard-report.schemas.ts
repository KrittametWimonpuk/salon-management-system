import { DateTime } from 'luxon'
import { z } from 'zod'

export const reportTypes = ['sales', 'bookings', 'payments', 'commissions', 'employee-performance',
  'service-performance', 'customers', 'branches'] as const
export const reportTypeSchema = z.enum(reportTypes)
export type ReportType = z.infer<typeof reportTypeSchema>

const dateInput = z.string().trim().refine((value) => /^\d{4}-\d{2}-\d{2}$/.test(value)
  || z.string().datetime({ offset: true }).safeParse(value).success, 'Must be an ISO date or datetime with offset')
const timezone = z.string().trim().min(1).max(64).refine((value) => DateTime.local().setZone(value).isValid,
  'Timezone must be a valid IANA timezone')
const uuid = z.string().uuid()
const integer = (fallback: number) => z.preprocess((value) => value === undefined ? fallback : Number(value), z.number().int())
const optionalText = z.string().trim().min(1).max(160).optional()

const filterFields = {
  dateFrom: dateInput.optional(),
  dateTo: dateInput.optional(),
  period: z.enum(['TODAY', 'THIS_WEEK', 'THIS_MONTH', 'LAST_MONTH', 'THIS_YEAR']).optional(),
  timezone: timezone.default('Asia/Bangkok'),
  branchId: uuid.optional(),
  employeeId: uuid.optional(),
  serviceId: uuid.optional(),
  customerId: uuid.optional(),
  granularity: z.enum(['daily', 'weekly', 'monthly', 'custom']).default('daily'),
  page: integer(1).pipe(z.number().min(1)),
  pageSize: integer(50).pipe(z.number().min(1).max(100)),
  sort: z.string().trim().min(1).max(80).default('date'),
  order: z.enum(['asc', 'desc']).default('desc'),
  keyword: optionalText,
  status: optionalText,
}

function validateRangeShape(value: { dateFrom?: string | undefined; dateTo?: string | undefined;
  period?: string | undefined }, context: z.RefinementCtx) {
  if ((value.dateFrom && !value.dateTo) || (!value.dateFrom && value.dateTo)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'dateFrom and dateTo must be provided together', path: ['dateFrom'] })
  }
  if (value.period && (value.dateFrom || value.dateTo)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'period cannot be combined with dateFrom/dateTo', path: ['period'] })
  }
}

export const dashboardReportQuerySchema = z.object(filterFields).superRefine(validateRangeShape)
export const reportRequestSchema = z.object(filterFields).superRefine(validateRangeShape)

export const exportRequestSchema = z.object({
  ...filterFields,
  format: z.enum(['csv', 'xlsx']),
  columns: z.array(z.string().trim().min(1).max(80)).max(50).optional(),
  includeSummary: z.boolean().default(true),
  title: z.string().trim().min(1).max(120).optional(),
}).superRefine(validateRangeShape)

export type DashboardReportRequest = z.infer<typeof dashboardReportQuerySchema>
export type ReportRequest = z.infer<typeof reportRequestSchema>
export type ExportReportRequest = z.infer<typeof exportRequestSchema>
