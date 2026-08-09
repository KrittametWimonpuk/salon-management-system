import { z } from 'zod'

const money = z.string().regex(/^(?:0|[1-9]\d{0,9})\.\d{2}$/, 'Amount must use a positive decimal with two digits')
const method = z.enum(['CASH', 'QR', 'CARD', 'BANK_TRANSFER', 'E_WALLET'])
const optionalText = (max: number) => z.string().trim().min(1).max(max).nullable().optional()
const paymentInput = z.object({ method, amount: money, currency: z.string().trim().length(3).toUpperCase(),
  externalReference: optionalText(255), idempotencyKey: optionalText(80), notes: optionalText(2_000) }).strict()

export const bookingPaymentParamsSchema = z.object({ bookingId: z.string().uuid() }).strict()
export const paymentParamsSchema = z.object({ paymentId: z.string().uuid() }).strict()
export const createPaymentSchema = paymentInput
export const createSplitPaymentSchema = z.object({ payments: z.array(paymentInput).min(2).max(10) }).strict()
export const voidPaymentSchema = z.object({ reason: z.string().trim().min(1).max(500) }).strict()
export const refundPaymentSchema = z.object({ amount: money, reason: z.string().trim().min(1).max(500),
  externalReference: optionalText(255), notes: optionalText(2_000) }).strict()
export const paymentListQuerySchema = z.object({ keyword: z.string().trim().min(1).max(160).optional(),
  bookingId: z.string().uuid().optional(), customerId: z.string().uuid().optional(), branchId: z.string().uuid().optional(),
  method: method.optional(), status: z.enum(['PENDING', 'PAID', 'PARTIAL', 'REFUNDED', 'VOID']).optional(),
  dateFrom: z.string().datetime({ offset: true }).optional(), dateTo: z.string().datetime({ offset: true }).optional(),
  page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.enum(['createdAt', 'updatedAt', 'paidAt', 'amount', 'status']).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc') }).strict()
  .refine((value) => !value.dateFrom || !value.dateTo || Date.parse(value.dateTo) > Date.parse(value.dateFrom),
    { message: 'dateTo must be after dateFrom', path: ['dateTo'] })

export type CreatePaymentRequest = z.infer<typeof createPaymentSchema>
export type CreateSplitPaymentRequest = z.infer<typeof createSplitPaymentSchema>
export type VoidPaymentRequest = z.infer<typeof voidPaymentSchema>
export type RefundPaymentRequest = z.infer<typeof refundPaymentSchema>
export type PaymentListRequest = z.infer<typeof paymentListQuerySchema>
