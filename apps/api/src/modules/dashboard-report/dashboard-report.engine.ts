import { DateTime, Interval } from 'luxon'
import type { DashboardReportSnapshot, ReportBookingAllocationFact,
  ReportSalesBookingFact } from '../../application/foundation/dashboard-report-repository.js'
import { ReportDataIntegrityError } from '../../domain/foundation/domain-errors.js'
import { failure, success, type Result } from '../../domain/foundation/result.js'
import type { ReportType } from './dashboard-report.schemas.js'

class ReportAggregationError extends Error {
  constructor(message: string, readonly details: Readonly<Record<string, unknown>> = {}) {
    super(message)
    this.name = 'ReportAggregationError'
  }
}

export type ReportCell = string | number | null
export type ReportRow = Readonly<Record<string, ReportCell>>

export interface ResolvedReportRange {
  dateFrom: Date
  dateTo: Date
  timezone: string
  granularity: 'daily' | 'weekly' | 'monthly' | 'custom'
}

export interface FinancialMetrics {
  grossSales: number
  discountTotal: number
  taxTotal: number
  netSales: number
  paidAmount: number
  refundedAmount: number
  voidedAmount: number
  outstandingAmount: number
  commissionTotal: number
  commissionAdjustmentTotal: number
}

interface SalesRowInternal extends FinancialMetrics {
  bookingId: string
  bookingNumber: string
  branchId: string
  branchName: string
  customerId: string
  customerNumber: string
  customerName: string
  date: Date
  paymentStatus: string
  grandTotal: number
  itemCount: number
}

const zeroFinancials = (): FinancialMetrics => ({ grossSales: 0, discountTotal: 0, taxTotal: 0,
  netSales: 0, paidAmount: 0, refundedAmount: 0, voidedAmount: 0, outstandingAmount: 0,
  commissionTotal: 0, commissionAdjustmentTotal: 0 })

export class DashboardReportEngine {
  salesRows(snapshot: DashboardReportSnapshot): readonly SalesRowInternal[] {
    return snapshot.sales.map((booking) => this.salesBooking(booking))
  }

  overview(snapshot: DashboardReportSnapshot, range: ResolvedReportRange): ReportRow {
    const sales = this.salesRows(snapshot)
    const financials = this.financialSummary(snapshot, sales)
    const status = this.bookingStatusCounts(snapshot)
    const customers = this.customerSummary(snapshot, sales, range)
    const service = this.servicePerformance(snapshot)
    const employees = this.employeePerformance(snapshot, range)
    const branches = this.branchPerformance(snapshot)
    return { ...status, ...customers, ...financials,
      averageTicketSize: sales.length ? divideHalfUp(financials.netSales, sales.length) : 0,
      topService: service[0]?.serviceName ?? null,
      topEmployee: employees[0]?.employeeName ?? null,
      topBranch: branches[0]?.branchName ?? null,
      timezone: range.timezone, dateFrom: range.dateFrom.toISOString(), dateTo: range.dateTo.toISOString() }
  }

  businessHealth(snapshot: DashboardReportSnapshot, range: ResolvedReportRange): ReportRow {
    const sales = this.salesRows(snapshot); const statuses = this.bookingStatusCounts(snapshot)
    const financials = this.financialSummary(snapshot, sales)
    const total = statuses.totalBookings
    return { ...financials, totalBookings: total,
      completedRateBps: ratioBps(statuses.completedBookings, total),
      cancellationRateBps: ratioBps(statuses.cancelledBookings, total),
      noShowRateBps: ratioBps(statuses.noShowBookings, total),
      refundRateBps: ratioBps(financials.refundedAmount, financials.paidAmount),
      averageTicketSize: sales.length ? divideHalfUp(financials.netSales, sales.length) : 0,
      timezone: range.timezone }
  }

  trends(snapshot: DashboardReportSnapshot, range: ResolvedReportRange): readonly ReportRow[] {
    const buckets = this.financialBuckets(snapshot, range)
    for (const booking of snapshot.bookings) this.addBucket(buckets, booking.startsAt, range, { bookings: 1,
      completed: booking.status === 'COMPLETED' ? 1 : 0 })
    return [...buckets.entries()].sort(([left], [right]) => left.localeCompare(right))
      .map(([date, values]) => ({ date, ...values }))
  }

  salesSummary(snapshot: DashboardReportSnapshot): ReportRow {
    const sales = this.salesRows(snapshot); const summary = this.financialSummary(snapshot, sales)
    return { ...summary, bookingCount: sales.length,
      averageTicketSize: sales.length ? divideHalfUp(summary.netSales, sales.length) : 0,
      refundRateBps: ratioBps(summary.refundedAmount, summary.paidAmount) }
  }

  salesTrend(snapshot: DashboardReportSnapshot, range: ResolvedReportRange): readonly ReportRow[] {
    return [...this.financialBuckets(snapshot, range).entries()].sort(([left], [right]) => left.localeCompare(right))
      .map(([date, values]) => ({ date, ...values }))
  }

  salesByBranch(snapshot: DashboardReportSnapshot): readonly ReportRow[] {
    const groups = new Map<string, FinancialMetrics & { bookingCount: number; branchName: string }>()
    const get = (branchId: string, branchName: string) => groups.get(branchId)
      ?? { ...zeroFinancials(), bookingCount: 0, branchName }
    for (const row of this.salesRows(snapshot)) {
      const value = get(row.branchId, row.branchName)
      value.grossSales += row.grossSales; value.discountTotal += row.discountTotal; value.taxTotal += row.taxTotal
      value.netSales += row.netSales; value.outstandingAmount += row.outstandingAmount; value.bookingCount += 1
      groups.set(row.branchId, value)
    }
    for (const payment of snapshot.payments) {
      const value = get(payment.branchId, payment.branchName); const amount = safe(attributedCents(payment.amount, payment.allocation))
      if (payment.status === 'VOID') value.voidedAmount += amount
      else value.paidAmount += amount
      groups.set(payment.branchId, value)
    }
    for (const refund of snapshot.refunds) {
      const value = get(refund.branchId, refund.branchName)
      value.refundedAmount += safe(attributedCents(refund.amount, refund.allocation)); groups.set(refund.branchId, value)
    }
    return [...groups.entries()].map(([branchId, value]) => ({ branchId, branchName: value.branchName,
      grossSales: value.grossSales, discountTotal: value.discountTotal, taxTotal: value.taxTotal,
      netSales: value.netSales, paidAmount: value.paidAmount, refundedAmount: value.refundedAmount,
      voidedAmount: value.voidedAmount, outstandingAmount: value.outstandingAmount, bookingCount: value.bookingCount,
      averageTicketSize: value.bookingCount ? divideHalfUp(value.netSales, value.bookingCount) : 0 }))
      .sort((a, b) => a.branchName.localeCompare(b.branchName))
  }

  salesByService(snapshot: DashboardReportSnapshot): readonly ReportRow[] {
    return this.servicePerformance(snapshot)
  }

  salesByEmployee(snapshot: DashboardReportSnapshot, range: ResolvedReportRange): readonly ReportRow[] {
    return this.employeePerformance(snapshot, range)
  }

  bookingSummary(snapshot: DashboardReportSnapshot, range: ResolvedReportRange): ReportRow {
    const counts = this.bookingStatusCounts(snapshot)
    const completedMinutes = snapshot.bookings.flatMap((booking) => booking.items)
      .filter((item) => item.status === 'COMPLETED').reduce((sum, item) => sum + item.durationMinutes, 0)
    const scheduledMinutes = this.scheduledWorkingMinutes(snapshot, range)
    return { ...counts, completedRateBps: ratioBps(counts.completedBookings, counts.totalBookings),
      cancellationRateBps: ratioBps(counts.cancelledBookings, counts.totalBookings),
      noShowRateBps: ratioBps(counts.noShowBookings, counts.totalBookings), completedServiceMinutes: completedMinutes,
      scheduledWorkingMinutes: scheduledMinutes, employeeUtilizationRateBps: ratioBps(completedMinutes, scheduledMinutes) }
  }

  bookingTrend(snapshot: DashboardReportSnapshot, range: ResolvedReportRange): readonly ReportRow[] {
    const groups = new Map<string, Record<string, number>>()
    for (const booking of snapshot.bookings) this.addBucket(groups, booking.startsAt, range, {
      totalBookings: 1, completedBookings: booking.status === 'COMPLETED' ? 1 : 0,
      cancelledBookings: booking.status === 'CANCELLED' ? 1 : 0, noShowBookings: booking.status === 'NO_SHOW' ? 1 : 0 })
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, values]) => ({ date, ...values }))
  }

  bookingStatusBreakdown(snapshot: DashboardReportSnapshot): readonly ReportRow[] {
    const counts = new Map<string, number>()
    for (const booking of snapshot.bookings) counts.set(booking.status, (counts.get(booking.status) ?? 0) + 1)
    return [...counts.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([status, count]) => ({ status, count }))
  }

  noShowCancellation(snapshot: DashboardReportSnapshot): ReportRow {
    const counts = this.bookingStatusCounts(snapshot)
    return { totalBookings: counts.totalBookings, cancelledBookings: counts.cancelledBookings,
      noShowBookings: counts.noShowBookings, cancellationRateBps: ratioBps(counts.cancelledBookings, counts.totalBookings),
      noShowRateBps: ratioBps(counts.noShowBookings, counts.totalBookings) }
  }

  paymentSummary(snapshot: DashboardReportSnapshot): ReportRow {
    const { paid, voided, refunded } = paymentLedger(snapshot)
    const outstanding = this.salesRows(snapshot).reduce((sum, item) => sum + BigInt(item.outstandingAmount), 0n)
    const partial = snapshot.payments.filter((item) => item.status === 'PARTIAL')
      .reduce((sum, item) => sum + attributedCents(item.amount, item.allocation), 0n)
    return { paidAmount: safe(paid), partialAmount: safe(partial), outstandingAmount: safe(outstanding),
      refundedAmount: safe(refunded), voidedAmount: safe(voided), netPaidAmount: safe(paid - refunded) }
  }

  paymentMethodBreakdown(snapshot: DashboardReportSnapshot): readonly ReportRow[] {
    const groups = new Map<string, { count: number; amount: bigint }>()
    for (const item of snapshot.payments.filter((payment) => payment.status !== 'VOID')) {
      const amount = attributedCents(item.amount, item.allocation)
      if (amount === 0n) continue
      const current = groups.get(item.method) ?? { count: 0, amount: 0n }; current.count += 1
      current.amount += amount; groups.set(item.method, current)
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))
      .map(([method, value]) => ({ method, paymentCount: value.count, paidAmount: safe(value.amount) }))
  }

  refundSummary(snapshot: DashboardReportSnapshot): ReportRow {
    const amounts = snapshot.refunds.map((item) => attributedCents(item.amount, item.allocation)).filter((amount) => amount !== 0n)
    return { refundCount: amounts.length, refundedAmount: safe(amounts.reduce((sum, amount) => sum + amount, 0n)) }
  }

  outstandingSummary(snapshot: DashboardReportSnapshot): ReportRow {
    const rows = this.salesRows(snapshot).filter((item) => item.outstandingAmount > 0)
    return { bookingCount: rows.length, outstandingAmount: rows.reduce((sum, item) => sum + item.outstandingAmount, 0) }
  }

  commissionSummary(snapshot: DashboardReportSnapshot): ReportRow {
    const base = snapshot.commissions.reduce((sum, item) => sum + signedCents(item.commissionAmount), 0n)
    const adjustments = snapshot.commissionAdjustments.reduce((sum, item) => sum + signedCents(item.adjustmentAmount), 0n)
    const approved = snapshot.commissions.flatMap((item) => item.approvalPeriods)
      .reduce((sum, item) => sum + signedCents(item.approvedAmount), 0n)
    const locked = snapshot.commissions.flatMap((item) => item.approvalPeriods)
      .filter((item) => item.status === 'LOCKED').reduce((sum, item) => sum + signedCents(item.approvedAmount), 0n)
      + snapshot.commissionAdjustments.filter((item) => item.periodStatus === 'LOCKED')
        .reduce((sum, item) => sum + signedCents(item.adjustmentAmount), 0n)
    return { commissionTotal: safe(base + adjustments), baseCommissionTotal: safe(base),
      commissionAdjustmentTotal: safe(adjustments), approvedCommissionTotal: safe(approved), lockedCommissionTotal: safe(locked) }
  }

  commissionBy(snapshot: DashboardReportSnapshot, dimension: 'employee' | 'branch' | 'period'): readonly ReportRow[] {
    const groups = new Map<string, { base: bigint; adjustment: bigint; label: string; status?: string;
      startsAt?: string; endsAt?: string }>()
    for (const item of snapshot.commissions) {
      if (dimension === 'period') {
        const periods = item.approvalPeriods.length ? item.approvalPeriods : [{ periodId: 'UNAPPROVED',
          startsAt: item.calculatedAt, endsAt: item.calculatedAt, status: 'OPEN' as const,
          approvedAmount: item.commissionAmount }]
        for (const period of periods) {
          const value = groups.get(period.periodId) ?? { base: 0n, adjustment: 0n,
            label: period.periodId === 'UNAPPROVED' ? 'UNAPPROVED' : period.periodId, status: period.status,
            ...(period.periodId === 'UNAPPROVED' ? {} : { startsAt: period.startsAt.toISOString(),
              endsAt: period.endsAt.toISOString() }) }
          value.base += signedCents(period.approvedAmount); groups.set(period.periodId, value)
        }
      } else {
        const key = dimension === 'employee' ? item.employeeId : item.branchId
        const label = dimension === 'employee' ? item.employeeName : item.branchName
        const value = groups.get(key) ?? { base: 0n, adjustment: 0n, label }
        value.base += signedCents(item.commissionAmount); groups.set(key, value)
      }
    }
    for (const item of snapshot.commissionAdjustments) {
      const key = dimension === 'employee' ? item.employeeId : dimension === 'branch' ? item.branchId : item.periodId
      const label = dimension === 'employee' ? item.employeeName : dimension === 'branch' ? item.branchName : item.periodId
      const value = groups.get(key) ?? { base: 0n, adjustment: 0n, label, ...(dimension === 'period'
        ? { status: item.periodStatus, startsAt: item.periodStartsAt.toISOString(), endsAt: item.periodEndsAt.toISOString() } : {}) }
      value.adjustment += signedCents(item.adjustmentAmount); groups.set(key, value)
    }
    return [...groups.entries()].map(([id, value]) => ({ id, name: value.label, ...(value.status ? { status: value.status } : {}),
      ...(value.startsAt ? { startsAt: value.startsAt } : {}), ...(value.endsAt ? { endsAt: value.endsAt } : {}),
      baseCommissionTotal: safe(value.base), commissionAdjustmentTotal: safe(value.adjustment),
      commissionTotal: safe(value.base + value.adjustment) })).sort((a, b) => Number(b.commissionTotal) - Number(a.commissionTotal))
  }

  employeePerformance(snapshot: DashboardReportSnapshot, range: ResolvedReportRange): readonly ReportRow[] {
    const groups = new Map<string, { name: string; revenue: bigint; bookings: Set<string>; services: number; commission: bigint;
      completedMinutes: number }>()
    for (const booking of snapshot.sales) {
      const revenue = itemNetRevenue(booking)
      for (const item of booking.items.filter(isIncluded)) {
      const value = groups.get(item.employeeId) ?? { name: item.employeeName, revenue: 0n, bookings: new Set(),
        services: 0, commission: 0n, completedMinutes: 0 }
      value.revenue += revenue.get(item.id) ?? 0n
      value.bookings.add(booking.id); value.services += item.quantity
      if (item.status === 'COMPLETED') value.completedMinutes += item.durationMinutes
      groups.set(item.employeeId, value)
      }
    }
    for (const item of snapshot.commissions) {
      const value = groups.get(item.employeeId) ?? { name: item.employeeName, revenue: 0n, bookings: new Set(),
        services: 0, commission: 0n, completedMinutes: 0 }
      value.commission += signedCents(item.commissionAmount); groups.set(item.employeeId, value)
    }
    for (const item of snapshot.commissionAdjustments) {
      const value = groups.get(item.employeeId) ?? { name: item.employeeName, revenue: 0n, bookings: new Set(),
        services: 0, commission: 0n, completedMinutes: 0 }
      value.commission += signedCents(item.adjustmentAmount); groups.set(item.employeeId, value)
    }
    const capacity = this.scheduledMinutesByEmployee(snapshot, range)
    return [...groups.entries()].map(([employeeId, value]) => ({ employeeId, employeeName: value.name,
      revenue: safe(value.revenue), bookingCount: value.bookings.size, serviceCount: value.services,
      commissionTotal: safe(value.commission), averageTicket: value.bookings.size
        ? divideHalfUp(safe(value.revenue), value.bookings.size) : 0, completedServiceMinutes: value.completedMinutes,
      scheduledWorkingMinutes: capacity.get(employeeId) ?? 0,
      utilizationRateBps: ratioBps(value.completedMinutes, capacity.get(employeeId) ?? 0) }))
      .sort((a, b) => Number(b.revenue) - Number(a.revenue))
  }

  employeeServiceBreakdown(snapshot: DashboardReportSnapshot): readonly ReportRow[] {
    const groups = new Map<string, { employeeId: string; employeeName: string; serviceId: string; serviceName: string;
      count: number; revenue: bigint }>()
    for (const booking of snapshot.sales) {
      const revenue = itemNetRevenue(booking)
      for (const item of booking.items.filter(isIncluded)) {
      const key = `${item.employeeId}:${item.serviceId}`; const value = groups.get(key) ?? { employeeId: item.employeeId,
        employeeName: item.employeeName, serviceId: item.serviceId, serviceName: item.serviceName, count: 0, revenue: 0n }
      value.count += item.quantity; value.revenue += revenue.get(item.id) ?? 0n
      groups.set(key, value)
      }
    }
    return [...groups.values()].map((item) => ({ ...item, revenue: safe(item.revenue) }))
      .sort((a, b) => Number(b.revenue) - Number(a.revenue))
  }

  servicePerformance(snapshot: DashboardReportSnapshot): readonly ReportRow[] {
    const groups = new Map<string, { name: string; revenue: bigint; count: number; price: bigint; refunds: bigint }>()
    for (const booking of snapshot.sales) {
      const revenue = itemNetRevenue(booking)
      for (const item of booking.items.filter(isIncluded)) {
        const value = groups.get(item.serviceId) ?? { name: item.serviceName, revenue: 0n, count: 0, price: 0n, refunds: 0n }
        const net = revenue.get(item.id) ?? 0n
        value.revenue += net; value.count += item.quantity; value.price += net
        groups.set(item.serviceId, value)
      }
    }
    for (const refund of snapshot.refunds) {
      const weights = itemNetRevenue(refund.allocation); const allocated = allocate(signedCents(refund.amount),
        refund.allocation.items.map((item) => ({ id: item.id, amount: weights.get(item.id) ?? 0n })))
      for (const item of refund.allocation.items.filter(isIncluded)) {
        const value = groups.get(item.serviceId) ?? { name: item.serviceName, revenue: 0n, count: 0, price: 0n, refunds: 0n }
        value.refunds += allocated.get(item.id) ?? 0n; groups.set(item.serviceId, value)
      }
    }
    return [...groups.entries()].map(([serviceId, value]) => ({ serviceId, serviceName: value.name,
      revenue: safe(value.revenue), serviceCount: value.count, refundImpact: safe(value.refunds),
      averagePrice: value.count ? divideHalfUp(safe(value.price), value.count) : 0 }))
      .sort((a, b) => Number(b.revenue) - Number(a.revenue))
  }

  serviceRevenueTrend(snapshot: DashboardReportSnapshot, range: ResolvedReportRange): readonly ReportRow[] {
    const groups = new Map<string, { serviceId: string; serviceName: string; date: string; revenue: bigint; count: number }>()
    for (const booking of snapshot.sales) {
      const revenue = itemNetRevenue(booking)
      for (const item of booking.items.filter(isIncluded)) {
      const date = bucket(booking.saleClosedAt, range); const key = `${date}:${item.serviceId}`
      const value = groups.get(key) ?? { serviceId: item.serviceId, serviceName: item.serviceName, date, revenue: 0n, count: 0 }
      value.revenue += revenue.get(item.id) ?? 0n; value.count += item.quantity
      groups.set(key, value)
      }
    }
    return [...groups.values()].map((item) => ({ ...item, revenue: safe(item.revenue) }))
      .sort((a, b) => a.date.localeCompare(b.date) || Number(b.revenue) - Number(a.revenue))
  }

  customerAnalytics(snapshot: DashboardReportSnapshot, range: ResolvedReportRange): ReportRow {
    const rows = this.salesRows(snapshot); return this.customerSummary(snapshot, rows, range)
  }

  newVsReturning(snapshot: DashboardReportSnapshot, range: ResolvedReportRange): readonly ReportRow[] {
    const summary = this.customerSummary(snapshot, this.salesRows(snapshot), range)
    return [{ type: 'NEW', count: summary.newCustomers }, { type: 'RETURNING', count: summary.returningCustomers }]
  }

  topCustomers(snapshot: DashboardReportSnapshot): readonly ReportRow[] {
    const groups = new Map<string, { number: string; name: string; spend: number; visits: number }>()
    for (const sale of this.salesRows(snapshot)) {
      const current = groups.get(sale.customerId) ?? { number: sale.customerNumber, name: sale.customerName, spend: 0, visits: 0 }
      current.spend += sale.netSales; current.visits += 1; groups.set(sale.customerId, current)
    }
    return [...groups.entries()].map(([customerId, value]) => ({ customerId, customerNumber: value.number,
      customerName: value.name, totalSpend: value.spend, visitCount: value.visits,
      averageSpend: value.visits ? divideHalfUp(value.spend, value.visits) : 0 }))
      .sort((a, b) => Number(b.totalSpend) - Number(a.totalSpend))
  }

  branchPerformance(snapshot: DashboardReportSnapshot): readonly ReportRow[] {
    const sales = new Map(this.salesByBranch(snapshot).map((item) => [String(item.branchId), item]))
    const bookingCounts = new Map<string, number>(); const payments = new Map<string, bigint>(); const refunds = new Map<string, bigint>()
    for (const item of snapshot.bookings) bookingCounts.set(item.branchId, (bookingCounts.get(item.branchId) ?? 0) + 1)
    for (const item of snapshot.payments.filter((payment) => payment.status !== 'VOID')) payments.set(item.branchId,
      (payments.get(item.branchId) ?? 0n) + attributedCents(item.amount, item.allocation))
    for (const item of snapshot.refunds) refunds.set(item.branchId,
      (refunds.get(item.branchId) ?? 0n) + attributedCents(item.amount, item.allocation))
    const commissions = new Map(this.commissionBy(snapshot, 'branch').map((item) => [String(item.id), Number(item.commissionTotal)]))
    return snapshot.branches.map((branch) => ({ branchId: branch.id, branchName: branch.name,
      netSales: Number(sales.get(branch.id)?.netSales ?? 0), bookingCount: bookingCounts.get(branch.id) ?? 0,
      paidAmount: safe(payments.get(branch.id) ?? 0n), refundedAmount: safe(refunds.get(branch.id) ?? 0n),
      commissionTotal: commissions.get(branch.id) ?? 0 })).sort((a, b) => b.netSales - a.netSales)
  }

  reportRows(type: ReportType, snapshot: DashboardReportSnapshot, range: ResolvedReportRange): readonly ReportRow[] {
    switch (type) {
      case 'sales': return this.salesRows(snapshot).map((row) => ({ date: row.date.toISOString(), bookingId: row.bookingId,
        bookingNumber: row.bookingNumber, branchId: row.branchId, branchName: row.branchName,
        customerId: row.customerId, customerNumber: row.customerNumber, customerName: row.customerName,
        paymentStatus: row.paymentStatus, grossSales: row.grossSales, discountTotal: row.discountTotal,
        taxTotal: row.taxTotal, netSales: row.netSales, paidAmount: row.paidAmount,
        refundedAmount: row.refundedAmount, outstandingAmount: row.outstandingAmount }))
      case 'bookings': return snapshot.bookings.map((row) => ({ date: row.startsAt.toISOString(), bookingId: row.id,
        bookingNumber: row.bookingNumber, branchId: row.branchId, branchName: row.branchName, customerId: row.customerId,
        status: row.status, paymentStatus: row.paymentStatus, source: row.source, serviceCount: row.items.length }))
      case 'payments': return snapshot.payments.map((row) => ({ date: row.paidAt?.toISOString() ?? null, paymentId: row.id,
        bookingId: row.bookingId, branchId: row.branchId, branchName: row.branchName, customerId: row.customerId,
        method: row.method, status: row.status, paidAmount: row.status === 'VOID' ? 0
          : safe(attributedCents(row.amount, row.allocation)), voidedAmount: row.status === 'VOID'
          ? safe(attributedCents(row.amount, row.allocation)) : 0,
        refundedAmount: safe(attributedCents(row.refundedAmount, row.allocation)) }))
      case 'commissions': return [...snapshot.commissions.map((row) => ({ date: row.calculatedAt.toISOString(),
        ledgerType: 'BASE', commissionId: row.id, bookingId: row.bookingId, bookingItemId: row.bookingItemId,
        branchId: row.branchId, branchName: row.branchName, employeeId: row.employeeId, employeeName: row.employeeName,
        serviceId: row.serviceId, serviceName: row.serviceName, amount: safe(signedCents(row.commissionAmount)),
        periodStatus: row.periodStatus })), ...snapshot.commissionAdjustments.map((row) => ({
        date: row.calculatedAt.toISOString(), ledgerType: 'ADJUSTMENT', commissionId: row.id, bookingId: row.bookingId,
        bookingItemId: row.bookingItemId, branchId: row.branchId, branchName: row.branchName,
        employeeId: row.employeeId, employeeName: row.employeeName, serviceId: row.serviceId,
        serviceName: row.serviceName, amount: safe(signedCents(row.adjustmentAmount)), periodStatus: row.periodStatus }))]
      case 'employee-performance': return this.employeePerformance(snapshot, range)
      case 'service-performance': return this.servicePerformance(snapshot)
      case 'customers': return this.topCustomers(snapshot)
      case 'branches': return this.branchPerformance(snapshot)
    }
  }

  reportSummary(type: ReportType, snapshot: DashboardReportSnapshot, range: ResolvedReportRange): ReportRow {
    switch (type) {
      case 'sales': return this.salesSummary(snapshot)
      case 'bookings': return this.bookingSummary(snapshot, range)
      case 'payments': return this.paymentSummary(snapshot)
      case 'commissions': return this.commissionSummary(snapshot)
      case 'employee-performance': return { employeeCount: this.employeePerformance(snapshot, range).length }
      case 'service-performance': return { serviceCount: this.servicePerformance(snapshot).length }
      case 'customers': return this.customerAnalytics(snapshot, range)
      case 'branches': return { branchCount: this.branchPerformance(snapshot).length }
    }
  }

  private salesBooking(booking: ReportSalesBookingFact): SalesRowInternal {
    const items = booking.items.filter(isIncluded); const revenue = itemNetRevenue(booking)
    const bookingDiscounts = allocate(cents(booking.bookingDiscountAmount), booking.items.map((item) => ({ id: item.id,
      amount: cents(item.subtotalAmount) - cents(item.discountAmount) })))
    const gross = items.reduce((sum, item) => sum + cents(item.subtotalAmount), 0n)
    const itemDiscount = items.reduce((sum, item) => sum + cents(item.discountAmount), 0n)
    const bookingDiscount = items.reduce((sum, item) => sum + (bookingDiscounts.get(item.id) ?? 0n), 0n)
    const discounts = itemDiscount + bookingDiscount
    const tax = items.reduce((sum, item) => sum + cents(item.taxAmount), 0n)
    const itemGrand = new Map(items.map((item) => [item.id, cents(item.totalAmount) - (bookingDiscounts.get(item.id) ?? 0n)]))
    const grand = [...itemGrand.values()].reduce((sum, amount) => sum + amount, 0n)
    const nonVoid = booking.payments.filter((item) => item.status !== 'VOID')
    const weights = booking.items.map((item) => ({ id: item.id, amount: revenue.get(item.id) ?? 0n }))
    const paidByItem = allocate(nonVoid.reduce((sum, item) => sum + cents(item.amount), 0n), weights)
    const refundByItem = allocate(nonVoid.reduce((sum, item) => sum + cents(item.refundedAmount), 0n), weights)
    const voidedByItem = allocate(booking.payments.filter((item) => item.status === 'VOID')
      .reduce((sum, item) => sum + cents(item.amount), 0n), weights)
    const paid = items.reduce((sum, item) => sum + (paidByItem.get(item.id) ?? 0n), 0n)
    const refunded = items.reduce((sum, item) => sum + (refundByItem.get(item.id) ?? 0n), 0n)
    const voided = items.reduce((sum, item) => sum + (voidedByItem.get(item.id) ?? 0n), 0n)
    const attributedOutstanding = items.reduce((sum, item) => {
      const amount = (itemGrand.get(item.id) ?? 0n) - (paidByItem.get(item.id) ?? 0n) + (refundByItem.get(item.id) ?? 0n)
      return sum + (amount > 0n ? amount : 0n)
    }, 0n)
    const bookingOutstanding = grand - paid + refunded
    const outstanding = items.length === booking.items.length
      ? (bookingOutstanding > 0n ? bookingOutstanding : 0n) : attributedOutstanding
    return { bookingId: booking.id, bookingNumber: booking.bookingNumber, branchId: booking.branchId,
      branchName: booking.branchName, customerId: booking.customerId, customerNumber: booking.customerNumber,
      customerName: booking.customerName, date: booking.saleClosedAt, paymentStatus: booking.paymentStatus,
      grossSales: safe(gross), discountTotal: safe(discounts), taxTotal: safe(tax), netSales: safe(gross - discounts),
      paidAmount: safe(paid), refundedAmount: safe(refunded), voidedAmount: safe(voided), outstandingAmount: safe(outstanding),
      commissionTotal: 0, commissionAdjustmentTotal: 0, grandTotal: safe(grand), itemCount: items.length }
  }

  private financialSummary(snapshot: DashboardReportSnapshot, sales: readonly SalesRowInternal[]): FinancialMetrics {
    const value = sales.reduce((total, row) => ({ grossSales: total.grossSales + row.grossSales,
      discountTotal: total.discountTotal + row.discountTotal, taxTotal: total.taxTotal + row.taxTotal,
      netSales: total.netSales + row.netSales, paidAmount: total.paidAmount + row.paidAmount,
      refundedAmount: total.refundedAmount + row.refundedAmount, voidedAmount: total.voidedAmount + row.voidedAmount,
      outstandingAmount: total.outstandingAmount + row.outstandingAmount, commissionTotal: total.commissionTotal,
      commissionAdjustmentTotal: total.commissionAdjustmentTotal }), zeroFinancials())
    const ledger = paymentLedger(snapshot)
    value.paidAmount = safe(ledger.paid); value.refundedAmount = safe(ledger.refunded); value.voidedAmount = safe(ledger.voided)
    const commissions = this.commissionSummary(snapshot)
    value.commissionTotal = Number(commissions.commissionTotal); value.commissionAdjustmentTotal = Number(commissions.commissionAdjustmentTotal)
    return value
  }

  private bookingStatusCounts(snapshot: DashboardReportSnapshot) {
    return { totalBookings: snapshot.bookings.length,
      completedBookings: snapshot.bookings.filter((item) => item.status === 'COMPLETED').length,
      cancelledBookings: snapshot.bookings.filter((item) => item.status === 'CANCELLED').length,
      noShowBookings: snapshot.bookings.filter((item) => item.status === 'NO_SHOW').length }
  }

  private customerSummary(snapshot: DashboardReportSnapshot, sales: readonly SalesRowInternal[], range: ResolvedReportRange) {
    const active = new Set(sales.map((item) => item.customerId))
    const created = new Set(snapshot.customers.filter((item) => item.createdInScope && item.createdAt >= range.dateFrom
      && item.createdAt < range.dateTo).map((item) => item.id))
    const total = new Set([...active, ...created])
    const newCustomers = created.size; const returningCustomers = [...active].filter((id) => !created.has(id)).length
    return { totalCustomers: total.size, newCustomers, returningCustomers,
      averageSpendPerCustomer: active.size ? divideHalfUp(sales.reduce((sum, item) => sum + item.netSales, 0), active.size) : 0 }
  }

  private financialBuckets(snapshot: DashboardReportSnapshot,
    range: ResolvedReportRange): Map<string, Record<string, number>> {
    const buckets = new Map<string, Record<string, number>>()
    for (const row of this.salesRows(snapshot)) this.addBucket(buckets, row.date, range, { grossSales: row.grossSales,
      discountTotal: row.discountTotal, taxTotal: row.taxTotal, netSales: row.netSales,
      outstandingAmount: row.outstandingAmount })
    for (const payment of snapshot.payments) if (payment.paidAt) this.addBucket(buckets, payment.paidAt, range,
      payment.status === 'VOID' ? { voidedAmount: safe(attributedCents(payment.amount, payment.allocation)) }
        : { paidAmount: safe(attributedCents(payment.amount, payment.allocation)) })
    for (const refund of snapshot.refunds) this.addBucket(buckets, refund.createdAt, range,
      { refundedAmount: safe(attributedCents(refund.amount, refund.allocation)) })
    return buckets
  }

  private addBucket(target: Map<string, Record<string, number>>, date: Date, range: ResolvedReportRange,
    values: Readonly<Record<string, number>>) {
    const key = bucket(date, range); const current = target.get(key) ?? {}
    for (const [name, value] of Object.entries(values)) current[name] = (current[name] ?? 0) + value
    target.set(key, current)
  }

  private scheduledWorkingMinutes(snapshot: DashboardReportSnapshot, range: ResolvedReportRange): number {
    return [...this.scheduledMinutesByEmployee(snapshot, range).values()].reduce((sum, value) => sum + value, 0)
  }

  private scheduledMinutesByEmployee(snapshot: DashboardReportSnapshot, range: ResolvedReportRange): ReadonlyMap<string, number> {
    const values = new Map<string, number>(); const zone = range.timezone
    let day = DateTime.fromJSDate(range.dateFrom, { zone }).startOf('day'); const end = DateTime.fromJSDate(range.dateTo, { zone })
    const reportWindow = Interval.fromDateTimes(DateTime.fromJSDate(range.dateFrom, { zone }), end)
    while (day < end) {
      const localDate = day.toISODate()!; const dayOfWeek = day.weekday % 7
      for (const hour of snapshot.workingHours.filter((item) => item.dayOfWeek === dayOfWeek
        && (!item.effectiveFrom || item.effectiveFrom <= localDate) && (!item.effectiveTo || item.effectiveTo >= localDate))) {
        const start = DateTime.fromISO(`${localDate}T${hour.startTime}`, { zone }); const finish = DateTime.fromISO(`${localDate}T${hour.endTime}`, { zone })
        if (!start.isValid || !finish.isValid || finish <= start) continue
        const interval = Interval.fromDateTimes(start, finish).intersection(reportWindow)
        if (!interval) continue
        const unavailable: Interval[] = []
        for (const holiday of snapshot.holidays.filter((item) => item.branchId === hour.branchId)) {
          const overlap = interval.intersection(Interval.fromDateTimes(DateTime.fromJSDate(holiday.startsAt, { zone }),
            DateTime.fromJSDate(holiday.endsAt, { zone })))
          if (overlap) unavailable.push(overlap)
        }
        for (const off of snapshot.timeOffs.filter((item) => item.employeeId === hour.employeeId
          && (item.branchId === null || item.branchId === hour.branchId))) {
          const overlap = interval.intersection(Interval.fromDateTimes(DateTime.fromJSDate(off.startsAt, { zone }),
            DateTime.fromJSDate(off.endsAt, { zone })))
          if (overlap) unavailable.push(overlap)
        }
        const unavailableMinutes = Interval.merge(unavailable)
          .reduce((sum, overlap) => sum + Math.round(overlap.length('minutes')), 0)
        const minutes = Math.round(interval.length('minutes')) - unavailableMinutes
        values.set(hour.employeeId, (values.get(hour.employeeId) ?? 0) + Math.max(0, minutes))
      }
      day = day.plus({ days: 1 })
    }
    return values
  }
}

export function cents(value: string): bigint {
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(value)
  if (!match) throw new ReportAggregationError('Invalid persisted money value', { value })
  const amount = BigInt(match[2]!) * 100n + BigInt((match[3] ?? '').padEnd(2, '0'))
  return match[1] === '-' ? -amount : amount
}
const signedCents = cents

function safe(value: bigint): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new ReportAggregationError('Money value exceeds safe integer cents range')
  }
  return Number(value)
}

function divideHalfUp(numerator: number, denominator: number): number {
  if (!denominator) return 0
  const sign = numerator < 0 ? -1 : 1
  return sign * Math.floor((Math.abs(numerator) + Math.floor(denominator / 2)) / denominator)
}

function ratioBps(numerator: number, denominator: number): number {
  return denominator > 0 ? divideHalfUp(numerator * 10_000, denominator) : 0
}

function bucket(date: Date, range: ResolvedReportRange): string {
  const value = DateTime.fromJSDate(date, { zone: range.timezone })
  switch (range.granularity) {
    case 'weekly': return value.startOf('week').toISODate()!
    case 'monthly': return value.startOf('month').toFormat('yyyy-MM')
    case 'custom': return `${DateTime.fromJSDate(range.dateFrom, { zone: range.timezone }).toISODate()}..${DateTime.fromJSDate(range.dateTo, { zone: range.timezone }).minus({ milliseconds: 1 }).toISODate()}`
    case 'daily': return value.toISODate()!
  }
}

function allocate(total: bigint, weights: readonly { id: string; amount: bigint }[]): ReadonlyMap<string, bigint> {
  const result = new Map<string, bigint>(); const denominator = weights.reduce((sum, item) => sum + item.amount, 0n)
  if (denominator <= 0n || total === 0n) { for (const item of weights) result.set(item.id, 0n); return result }
  let allocated = 0n
  const ordered = [...weights].sort((left, right) => left.id.localeCompare(right.id))
  ordered.forEach((item, index) => {
    const value = index === ordered.length - 1 ? total - allocated : total * item.amount / denominator
    result.set(item.id, value); allocated += value
  })
  return result
}

function isIncluded(item: { included?: boolean }): boolean {
  return item.included !== false
}

function itemNetRevenue(booking: Pick<ReportSalesBookingFact, 'items' | 'bookingDiscountAmount'>
  | ReportBookingAllocationFact): ReadonlyMap<string, bigint> {
  const beforeBookingDiscount = booking.items.map((item) => ({
    id: item.id,
    amount: signedCents(item.subtotalAmount) - signedCents(item.discountAmount),
  }))
  const discount = allocate(signedCents(booking.bookingDiscountAmount), beforeBookingDiscount)
  return new Map(beforeBookingDiscount.map((item) => [item.id, item.amount - (discount.get(item.id) ?? 0n)]))
}

function attributedCents(value: string, allocation?: ReportBookingAllocationFact): bigint {
  const amount = signedCents(value)
  if (!allocation) return amount
  const revenue = itemNetRevenue(allocation)
  const attributed = allocate(amount, allocation.items.map((item) => ({ id: item.id, amount: revenue.get(item.id) ?? 0n })))
  return allocation.items.filter(isIncluded).reduce((sum, item) => sum + (attributed.get(item.id) ?? 0n), 0n)
}

function paymentLedger(snapshot: DashboardReportSnapshot): { paid: bigint; refunded: bigint; voided: bigint } {
  const paid = snapshot.payments.filter((item) => item.status !== 'VOID')
    .reduce((sum, item) => sum + attributedCents(item.amount, item.allocation), 0n)
  const voided = snapshot.payments.filter((item) => item.status === 'VOID')
    .reduce((sum, item) => sum + attributedCents(item.amount, item.allocation), 0n)
  const refunded = snapshot.refunds.reduce((sum, item) => sum + attributedCents(item.amount, item.allocation), 0n)
  return { paid, refunded, voided }
}

export function validateSnapshot(snapshot: DashboardReportSnapshot): Result<DashboardReportSnapshot, ReportDataIntegrityError> {
  try {
    for (const sale of snapshot.sales) {
      for (const item of sale.items) { cents(item.subtotalAmount); cents(item.discountAmount); cents(item.taxAmount); cents(item.totalAmount) }
      cents(sale.bookingDiscountAmount)
    }
    return success(snapshot)
  } catch (error) {
    return failure(error instanceof ReportAggregationError
      ? new ReportDataIntegrityError(error.message, error.details)
      : new ReportDataIntegrityError('Report snapshot is invalid'))
  }
}
