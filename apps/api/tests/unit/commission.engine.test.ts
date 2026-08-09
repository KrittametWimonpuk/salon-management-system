import { describe, expect, it } from 'vitest'
import type { BookingItemRecord, CommissionRuleRecord } from '../../src/application/foundation/repositories.js'
import { CommissionFinancialEngine } from '../../src/modules/commission/commission.engine.js'

const engine = new CommissionFinancialEngine()
const item = (id: string, subtotalAmount: string, taxAmount = '0.00'): BookingItemRecord => ({
  id, bookingId: 'booking', serviceId: `service-${id}`, employeeId: 'employee', employeeName: 'May',
  serviceName: `Service ${id}`, status: 'COMPLETED', startsAt: new Date('2026-08-09T00:00:00Z'),
  endsAt: new Date('2026-08-09T01:00:00Z'), durationMinutes: 60, quantity: 1, unitPrice: subtotalAmount,
  discountAmount: '0.00', subtotalAmount, taxType: taxAmount === '0.00' ? 'NONE' : 'VAT',
  taxMode: taxAmount === '0.00' ? 'EXCLUDED' : 'INCLUDED', taxRate: taxAmount === '0.00' ? '0.00' : '7.00',
  taxAmount, totalAmount: subtotalAmount, notes: null, createdAt: new Date(), updatedAt: new Date(),
})
const rule = (type: CommissionRuleRecord['type'], values: Partial<CommissionRuleRecord> = {}): CommissionRuleRecord => ({
  id: `rule-${type}`, organizationId: 'organization', branchId: null, employeeId: null, serviceId: null,
  name: type, type, basis: 'PAID_AMOUNT', percentageRate: null, fixedAmount: null, priority: 0,
  effectiveFrom: new Date('2026-01-01'), effectiveTo: null, tiers: [], ...values,
})

describe('CommissionFinancialEngine', () => {
  it('allocates paid before-tax bases deterministically with half-up rounding', () => {
    const result = engine.allocateBases([item('b', '535.00', '35.00'), item('a', '535.00', '35.00')],
      '0.00', '535.00', '1070.00')
    expect(result).toMatchObject({ ok: true, value: [
      { bookingItemId: 'a', originalBeforeTaxAmount: '500.00', commissionBaseAmount: '250.00' },
      { bookingItemId: 'b', originalBeforeTaxAmount: '500.00', commissionBaseAmount: '250.00' },
    ] })
  })

  it('calculates PERCENT and FIXED commission without floating point', () => {
    expect(engine.calculate(rule('PERCENT', { percentageRate: '30.00' }), '1000.00', '1000.00'))
      .toMatchObject({ ok: true, value: { commissionAmount: '300.00' } })
    expect(engine.calculate(rule('FIXED', { fixedAmount: '50.00' }), '10.00', '10.00'))
      .toMatchObject({ ok: true, value: { commissionAmount: '50.00' } })
  })

  it('uses a flat TIER from cumulative period base', () => {
    const tiered = rule('TIER', { tiers: [
      { id: 'one', minimumAmount: '0.00', maximumAmount: '30000.00', percentageRate: '30.00', fixedAmount: null },
      { id: 'two', minimumAmount: '30000.01', maximumAmount: '60000.00', percentageRate: '35.00', fixedAmount: null },
    ] })
    expect(engine.calculate(tiered, '1000.00', '45000.00'))
      .toMatchObject({ ok: true, value: { percentageRate: '35.00', commissionAmount: '350.00' } })
  })

  it('adds fixed and percentage components for MIXED', () => {
    expect(engine.calculate(rule('MIXED', { percentageRate: '10.00', fixedAmount: '50.00' }),
      '1000.00', '1000.00')).toMatchObject({ ok: true,
      value: { commissionAmount: '150.00', percentageRate: '10.00', fixedAmount: '50.00' } })
  })

  it('calculates proportional negative refund targets', () => {
    expect(engine.proportionalRefundTarget('300.00', '1000.00', '500.00'))
      .toEqual({ ok: true, value: '150.00' })
  })

  it('allocates a zero base after a full refund', () => {
    expect(engine.allocateBases([item('a', '1070.00', '70.00')], '0.00', '0.00', '1070.00'))
      .toMatchObject({ ok: true, value: [{ bookingItemId: 'a', commissionBaseAmount: '0.00' }] })
  })
})
