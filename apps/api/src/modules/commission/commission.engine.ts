import type { BookingItemRecord, CommissionRuleRecord } from '../../application/foundation/repositories.js'
import { CommissionBaseAmountInvalidError, CommissionFinancialIntegrityError,
  CommissionTierNotFoundError, type DomainError } from '../../domain/foundation/domain-errors.js'
import { failure, success, type Result } from '../../domain/foundation/result.js'

export interface AllocatedCommissionBase {
  bookingItemId: string
  employeeId: string
  serviceId: string
  serviceName: string
  originalBeforeTaxAmount: string
  commissionBaseAmount: string
}

export interface CommissionAmountResult {
  commissionAmount: string
  percentageRate: string | null
  fixedAmount: string | null
}

export class CommissionFinancialEngine {
  allocateBases(items: readonly BookingItemRecord[], bookingDiscountAmount: string,
    netPaidAmount: string, grandTotalAmount: string): Result<readonly AllocatedCommissionBase[], DomainError> {
    try {
      const eligible = items.filter((item) => item.status === 'COMPLETED').sort((a, b) => a.id.localeCompare(b.id))
      if (!eligible.length) return failure(new CommissionBaseAmountInvalidError('Booking has no eligible commission items'))
      const raw = eligible.map((item) => ({ item, amount: beforeTax(item) }))
      const totalRaw = sum(raw.map(({ amount }) => amount))
      const bookingDiscount = cents(bookingDiscountAmount)
      const paid = cents(netPaidAmount); const grandTotal = cents(grandTotalAmount)
      if (totalRaw <= 0n || bookingDiscount < 0n || bookingDiscount > totalRaw || paid < 0n || grandTotal <= 0n
        || paid > grandTotal) return failure(new CommissionBaseAmountInvalidError('Commission base inputs are invalid'))
      const discountAllocation = allocate(bookingDiscount, raw.map(({ item, amount }) => ({ id: item.id, weight: amount })))
      const net = raw.map(({ item, amount }) => ({ item, original: amount,
        amount: amount - (discountAllocation.get(item.id) ?? 0n) }))
      const totalNet = sum(net.map(({ amount }) => amount))
      const paidBaseTotal = roundDivide(totalNet * paid, grandTotal)
      const paidAllocation = allocate(paidBaseTotal, net.map(({ item, amount }) => ({ id: item.id, weight: amount })))
      return success(net.map(({ item, original }) => ({ bookingItemId: item.id, employeeId: item.employeeId,
        serviceId: item.serviceId, serviceName: item.serviceName, originalBeforeTaxAmount: money(original),
        commissionBaseAmount: money(paidAllocation.get(item.id) ?? 0n) })))
    } catch {
      return failure(new CommissionFinancialIntegrityError('Commission allocation contains invalid money data'))
    }
  }

  calculate(rule: CommissionRuleRecord, baseAmount: string, cumulativePeriodBase: string): Result<CommissionAmountResult, DomainError> {
    try {
      const base = cents(baseAmount); const cumulative = cents(cumulativePeriodBase)
      if (base < 0n || cumulative < base) return failure(new CommissionBaseAmountInvalidError('Commission base is invalid'))
      let percentageRate = rule.percentageRate; let fixedAmount = rule.fixedAmount
      if (rule.type === 'TIER') {
        const tier = rule.tiers.find((candidate) => cents(candidate.minimumAmount) <= cumulative
          && (candidate.maximumAmount === null || cumulative <= cents(candidate.maximumAmount)))
        if (!tier) return failure(new CommissionTierNotFoundError('No flat commission tier matches the period base'))
        percentageRate = tier.percentageRate; fixedAmount = tier.fixedAmount
      }
      if (rule.type === 'PERCENT' && percentageRate === null) return this.invalidRule(rule)
      if (rule.type === 'FIXED' && fixedAmount === null) return this.invalidRule(rule)
      if (rule.type === 'MIXED' && (percentageRate === null || fixedAmount === null)) return this.invalidRule(rule)
      if (rule.type === 'TIER' && percentageRate === null && fixedAmount === null) return this.invalidRule(rule)
      const percent = percentageRate === null ? 0n : roundDivide(base * basisPoints(percentageRate), 10_000n)
      const fixed = fixedAmount === null ? 0n : cents(fixedAmount)
      const amount = percent + fixed
      if (amount < 0n || (amount > base && rule.type !== 'FIXED')) {
        return failure(new CommissionFinancialIntegrityError('Commission amount exceeds the permitted base'))
      }
      return success({ commissionAmount: money(amount), percentageRate, fixedAmount })
    } catch {
      return failure(new CommissionFinancialIntegrityError('Commission rule contains invalid financial data'))
    }
  }

  proportionalRefundTarget(currentAmount: string, previousBase: string, nextBase: string): Result<string, DomainError> {
    try {
      const current = cents(currentAmount); const previous = cents(previousBase); const next = cents(nextBase)
      if (current < 0n || previous <= 0n || next < 0n || next > previous) {
        return failure(new CommissionBaseAmountInvalidError('Refund commission base is invalid'))
      }
      return success(money(roundDivide(current * next, previous)))
    } catch { return failure(new CommissionFinancialIntegrityError('Refund adjustment contains invalid money data')) }
  }

  private invalidRule(rule: CommissionRuleRecord) {
    return failure(new CommissionFinancialIntegrityError(`Commission rule ${rule.id} is incomplete`))
  }
}

export function cents(value: string): bigint {
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(value)
  if (!match) throw new RangeError('Invalid money value')
  const amount = BigInt(match[2]!) * 100n + BigInt((match[3] ?? '').padEnd(2, '0'))
  return match[1] === '-' ? -amount : amount
}
export function money(value: bigint): string {
  const sign = value < 0n ? '-' : ''; const absolute = value < 0n ? -value : value
  return `${sign}${absolute / 100n}.${(absolute % 100n).toString().padStart(2, '0')}`
}
function beforeTax(item: BookingItemRecord) {
  const subtotal = cents(item.subtotalAmount) - cents(item.discountAmount)
  const value = item.taxType === 'VAT' && item.taxMode === 'INCLUDED' ? subtotal - cents(item.taxAmount) : subtotal
  return value > 0n ? value : 0n
}
function basisPoints(value: string) {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value); if (!match) throw new RangeError('Invalid rate')
  return BigInt(match[1]!) * 100n + BigInt((match[2] ?? '').padEnd(2, '0'))
}
function roundDivide(numerator: bigint, denominator: bigint) {
  if (denominator <= 0n) throw new RangeError('Invalid denominator')
  return (numerator + denominator / 2n) / denominator
}
function sum(values: readonly bigint[]) { return values.reduce((total, value) => total + value, 0n) }
function allocate(total: bigint, values: readonly { id: string; weight: bigint }[]) {
  const result = new Map<string, bigint>(); const weightTotal = sum(values.map(({ weight }) => weight))
  if (total === 0n || weightTotal === 0n) { for (const value of values) result.set(value.id, 0n); return result }
  const shares = values.map((value) => { const numerator = total * value.weight
    return { ...value, amount: numerator / weightTotal, remainder: numerator % weightTotal } })
  let remainder = total - sum(shares.map(({ amount }) => amount))
  shares.sort((a, b) => a.remainder === b.remainder ? a.id.localeCompare(b.id) : a.remainder > b.remainder ? -1 : 1)
  for (const share of shares) { const extra = remainder > 0n ? 1n : 0n; result.set(share.id, share.amount + extra); remainder -= extra }
  return result
}
