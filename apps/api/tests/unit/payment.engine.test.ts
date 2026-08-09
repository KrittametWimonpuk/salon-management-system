import { describe, expect, it } from 'vitest'
import type { BookingItemRecord, CheckoutFinancialRecord, PaymentRecord } from '../../src/application/foundation/repositories.js'
import { PaymentFinancialEngine } from '../../src/modules/pos-payment/payment.engine.js'

const now = new Date('2026-08-08T00:00:00.000Z')
function item(overrides: Partial<BookingItemRecord> = {}): BookingItemRecord {
  return { id: 'item', bookingId: 'booking', serviceId: 'service', employeeId: 'employee', employeeName: 'May',
    serviceName: 'Cut', status: 'COMPLETED', startsAt: now, endsAt: now, durationMinutes: 60, quantity: 1,
    unitPrice: '100.00', discountAmount: '0.00', subtotalAmount: '100.00', taxType: 'VAT', taxMode: 'INCLUDED',
    taxRate: '7.00', taxAmount: '6.54', totalAmount: '100.00', notes: null, createdAt: now, updatedAt: now, ...overrides }
}
function payment(overrides: Partial<PaymentRecord> = {}): PaymentRecord {
  return { id: 'payment', bookingId: 'booking', branchId: 'branch', bookingNumber: 'BKG-1', customerId: 'customer',
    customerName: 'Jane', customerPhone: null, receivedByUserId: 'user', cashierName: 'Cashier', amount: '100.00',
    currency: 'THB', method: 'CASH', status: 'PAID', externalReference: null, idempotencyKey: null, paidAt: now,
    refundedAt: null, voidedAt: null, voidReason: null, notes: null, refunds: [], refundedAmount: '0.00',
    netAmount: '100.00', createdAt: now, updatedAt: now, ...overrides }
}
function data(overrides: Partial<CheckoutFinancialRecord> = {}): CheckoutFinancialRecord {
  return { organizationId: 'org', organizationName: 'Salon', currency: 'THB', branchId: 'branch', branchName: 'Main',
    customerId: 'customer', customerName: 'Jane', customerPhone: null, bookingId: 'booking', bookingNumber: 'BKG-1',
    bookingStatus: 'COMPLETED', paymentStatus: 'PENDING', saleClosedAt: null, closedByUserId: null,
    closedByName: null, items: [item()], discounts: [], payments: [], ...overrides }
}

describe('Payment financial engine', () => {
  const engine = new PaymentFinancialEngine()

  it('summarizes inclusive and exclusive tax snapshots without floating point', () => {
    const result = engine.summarize(data({ items: [item(), item({ id: 'exclusive', unitPrice: '100.00',
      subtotalAmount: '100.00', taxMode: 'EXCLUDED', taxAmount: '7.00', totalAmount: '107.00' })] }))
    expect(result).toMatchObject({ ok: true, value: { subtotalAmount: '200.00', taxAmount: '13.54',
      grandTotal: '207.00', taxSummary: [{ taxMode: 'INCLUDED', taxAmount: '6.54' },
        { taxMode: 'EXCLUDED', taxAmount: '7.00' }] } })
  })

  it('uses immutable booking and item discount snapshots', () => {
    expect(engine.summarize(data({ items: [item({ discountAmount: '5.00', totalAmount: '95.00' })],
      discounts: [{ id: 'discount', promotionId: null, promotionCode: 'VIP', description: 'VIP snapshot',
        discountType: 'FIXED', discountValue: '10.00', discountAmount: '10.00' }] })))
      .toMatchObject({ ok: true, value: { itemDiscountAmount: '5.00', bookingDiscountAmount: '10.00',
        discountAmount: '15.00', grandTotal: '85.00' } })
  })

  it('derives partial, paid, and refunded aggregate status from net payments', () => {
    expect(engine.summarize(data({ payments: [payment({ amount: '40.00', netAmount: '40.00' })] })))
      .toMatchObject({ ok: true, value: { paymentStatus: 'PARTIAL', remainingAmount: '60.00' } })
    expect(engine.summarize(data({ payments: [payment()] })))
      .toMatchObject({ ok: true, value: { paymentStatus: 'PAID', remainingAmount: '0.00' } })
    expect(engine.summarize(data({ payments: [payment({ status: 'REFUNDED', refundedAmount: '100.00',
      netAmount: '0.00' })] }))).toMatchObject({ ok: true, value: { paymentStatus: 'REFUNDED', paidAmount: '0.00' } })
  })

  it('rejects non-completed and empty bookings', () => {
    expect(engine.validatePayable(data({ bookingStatus: 'IN_PROGRESS' })))
      .toMatchObject({ ok: false, error: { code: 'BUSINESS_RULE_VIOLATION' } })
    expect(engine.validatePayable(data({ items: [] })))
      .toMatchObject({ ok: false, error: { message: 'Booking has no payable items' } })
  })

  it('rejects overpaid and excessive-discount financial history', () => {
    expect(engine.summarize(data({ payments: [payment({ amount: '101.00', netAmount: '101.00' })] })))
      .toMatchObject({ ok: false, error: { code: 'BUSINESS_RULE_VIOLATION' } })
    expect(engine.summarize(data({ discounts: [{ id: 'discount', promotionId: null, promotionCode: null,
      description: 'Invalid', discountType: 'FIXED', discountValue: '101.00', discountAmount: '101.00' }] })))
      .toMatchObject({ ok: false, error: { code: 'BUSINESS_RULE_VIOLATION' } })
  })
})
