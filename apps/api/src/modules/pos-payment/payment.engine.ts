import type { CheckoutFinancialRecord, PaymentStatusValue,
  TaxModeValue, TaxTypeValue } from '../../application/foundation/repositories.js'
import { BookingNotPayableError, FinancialIntegrityError,
  PaymentAmountInvalidError } from '../../domain/foundation/domain-errors.js'
import { failure, success, type Result } from '../../domain/foundation/result.js'

export interface TaxSummaryLine {
  taxType: TaxTypeValue
  taxMode: TaxModeValue
  taxRate: string
  taxableAmount: string
  taxAmount: string
}

export interface CheckoutSummary {
  organizationId: string
  organizationName: string
  branchId: string
  branchName: string
  customerId: string
  customerName: string
  customerPhone: string | null
  bookingId: string
  bookingNumber: string
  bookingStatus: CheckoutFinancialRecord['bookingStatus']
  paymentStatus: PaymentStatusValue
  saleClosedAt: Date | null
  currency: string
  items: CheckoutFinancialRecord['items']
  discounts: CheckoutFinancialRecord['discounts']
  payments: CheckoutFinancialRecord['payments']
  subtotalAmount: string
  itemDiscountAmount: string
  bookingDiscountAmount: string
  discountAmount: string
  taxAmount: string
  grandTotal: string
  grossPaidAmount: string
  refundedAmount: string
  paidAmount: string
  remainingAmount: string
  taxSummary: readonly TaxSummaryLine[]
}

export class PaymentFinancialEngine {
  summarize(data: CheckoutFinancialRecord): Result<CheckoutSummary, FinancialIntegrityError> {
    const items = data.items.filter((item) => item.status !== 'CANCELLED')
    const subtotal = sum(items.map((item) => item.subtotalAmount))
    const itemDiscount = sum(items.map((item) => item.discountAmount))
    const bookingDiscount = sum(data.discounts.map((discount) => discount.discountAmount))
    const discount = itemDiscount + bookingDiscount
    const tax = sum(items.map((item) => item.taxAmount))
    const itemTotal = sum(items.map((item) => item.totalAmount))
    const grandTotal = itemTotal - bookingDiscount
    const nonVoid = data.payments.filter((payment) => payment.status !== 'VOID')
    const grossPaid = sum(nonVoid.map((payment) => payment.amount))
    const refunded = sum(nonVoid.map((payment) => payment.refundedAmount))
    const netPaid = grossPaid - refunded
    if (subtotal < 0n || discount < 0n || tax < 0n || grandTotal < 0n || refunded < 0n || netPaid < 0n
      || refunded > grossPaid || netPaid > grandTotal) {
      return failure(new FinancialIntegrityError('Financial snapshot totals are inconsistent'))
    }
    const remaining = grandTotal - netPaid
    const paymentStatus = calculatePaymentStatus(grandTotal, netPaid, refunded)
    return success({ organizationId: data.organizationId, organizationName: data.organizationName,
      branchId: data.branchId, branchName: data.branchName, customerId: data.customerId,
      customerName: data.customerName, customerPhone: data.customerPhone, bookingId: data.bookingId,
      bookingNumber: data.bookingNumber, bookingStatus: data.bookingStatus, paymentStatus,
      saleClosedAt: data.saleClosedAt, currency: data.currency, items, discounts: data.discounts,
      payments: data.payments, subtotalAmount: money(subtotal), itemDiscountAmount: money(itemDiscount),
      bookingDiscountAmount: money(bookingDiscount), discountAmount: money(discount), taxAmount: money(tax),
      grandTotal: money(grandTotal), grossPaidAmount: money(grossPaid), refundedAmount: money(refunded),
      paidAmount: money(netPaid), remainingAmount: money(remaining), taxSummary: taxLines(items) })
  }

  validatePayable(data: CheckoutFinancialRecord): Result<CheckoutSummary,
    BookingNotPayableError | FinancialIntegrityError> {
    if (data.bookingStatus !== 'COMPLETED') {
      return failure(new BookingNotPayableError('Only completed bookings can accept payment'))
    }
    if (!data.items.some((item) => item.status !== 'CANCELLED')) {
      return failure(new BookingNotPayableError('Booking has no payable items'))
    }
    return this.summarize(data)
  }

  parseAmount(value: string): Result<bigint, PaymentAmountInvalidError> {
    try {
      const amount = cents(value)
      return amount > 0n ? success(amount) : failure(new PaymentAmountInvalidError('Payment amount must be greater than zero'))
    } catch {
      return failure(new PaymentAmountInvalidError('Payment amount must use a valid decimal value'))
    }
  }
}

function calculatePaymentStatus(total: bigint, paid: bigint, refunded: bigint): PaymentStatusValue {
  if (paid >= total && total > 0n) return 'PAID'
  if (paid > 0n) return 'PARTIAL'
  if (refunded > 0n) return 'REFUNDED'
  return 'PENDING'
}

function taxLines(items: CheckoutFinancialRecord['items']): readonly TaxSummaryLine[] {
  const grouped = new Map<string, { taxType: TaxTypeValue; taxMode: TaxModeValue; taxRate: string;
    taxable: bigint; tax: bigint }>()
  for (const item of items) {
    const key = `${item.taxType}:${item.taxMode}:${item.taxRate}`
    const line = grouped.get(key) ?? { taxType: item.taxType, taxMode: item.taxMode,
      taxRate: item.taxRate, taxable: 0n, tax: 0n }
    line.taxable += cents(item.subtotalAmount); line.tax += cents(item.taxAmount); grouped.set(key, line)
  }
  return [...grouped.values()].map((line) => ({ taxType: line.taxType, taxMode: line.taxMode,
    taxRate: line.taxRate, taxableAmount: money(line.taxable), taxAmount: money(line.tax) }))
}

export function cents(value: string): bigint {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value)
  if (!match) throw new RangeError('Invalid money value')
  return BigInt(match[1]!) * 100n + BigInt((match[2] ?? '').padEnd(2, '0'))
}
export function money(value: bigint): string { return `${value / 100n}.${(value % 100n).toString().padStart(2, '0')}` }
function sum(values: readonly string[]) { return values.reduce((total, value) => total + cents(value), 0n) }
