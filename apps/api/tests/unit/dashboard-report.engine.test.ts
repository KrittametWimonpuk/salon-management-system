import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import type { DashboardReportSnapshot } from '../../src/application/foundation/dashboard-report-repository.js'
import { FixedClock } from '../../src/infrastructure/foundation/system-adapters.js'
import { DashboardReportEngine } from '../../src/modules/dashboard-report/dashboard-report.engine.js'
import { DashboardReportExporter } from '../../src/modules/dashboard-report/dashboard-report.exporter.js'
import { resolveReportRange } from '../../src/modules/dashboard-report/dashboard-report.use-cases.js'

const range = { dateFrom: new Date('2026-07-31T17:00:00.000Z'), dateTo: new Date('2026-08-31T17:00:00.000Z'),
  timezone: 'Asia/Bangkok', granularity: 'daily' as const }

function snapshot(): DashboardReportSnapshot {
  return {
    sales: [{ id: 'booking-1', bookingNumber: 'B-1', branchId: 'branch-1', branchName: 'Main', customerId: 'customer-1',
      customerNumber: 'C-1', customerName: '=Injected', status: 'COMPLETED', paymentStatus: 'PARTIAL',
      startsAt: new Date('2026-08-01T02:00:00.000Z'), saleClosedAt: new Date('2026-08-01T10:00:00.000Z'),
      items: [{ id: 'item-1', serviceId: 'service-1', serviceName: 'Color', employeeId: 'employee-1',
        employeeName: 'May', status: 'COMPLETED', durationMinutes: 60, quantity: 1, subtotalAmount: '1000.00',
        discountAmount: '0.00', taxAmount: '70.00', totalAmount: '1070.00' }], bookingDiscountAmount: '100.00',
      payments: [{ id: 'payment-1', bookingId: 'booking-1', branchId: 'branch-1', branchName: 'Main',
        customerId: 'customer-1', method: 'CARD', status: 'PARTIAL', amount: '800.00',
        paidAt: new Date('2026-08-01T10:00:00.000Z'), voidedAt: null, refundedAmount: '100.00' },
      { id: 'payment-void', bookingId: 'booking-1', branchId: 'branch-1', branchName: 'Main',
        customerId: 'customer-1', method: 'CASH', status: 'VOID', amount: '50.00',
        paidAt: new Date('2026-08-01T10:00:00.000Z'), voidedAt: new Date('2026-08-01T11:00:00.000Z'),
        refundedAmount: '0.00' }] }],
    bookings: [{ id: 'booking-1', bookingNumber: 'B-1', branchId: 'branch-1', branchName: 'Main',
      customerId: 'customer-1', status: 'COMPLETED', paymentStatus: 'PARTIAL', source: 'PHONE',
      startsAt: new Date('2026-08-01T02:00:00.000Z'), completedAt: new Date('2026-08-01T03:00:00.000Z'),
      saleClosedAt: new Date('2026-08-01T10:00:00.000Z'),
      items: [{ id: 'item-1', employeeId: 'employee-1', serviceId: 'service-1', status: 'COMPLETED', durationMinutes: 60 }] },
    { id: 'booking-2', bookingNumber: 'B-2', branchId: 'branch-1', branchName: 'Main', customerId: 'customer-2',
      status: 'NO_SHOW', paymentStatus: 'PENDING', source: 'WEBSITE', startsAt: new Date('2026-08-02T02:00:00.000Z'),
      completedAt: null, saleClosedAt: null, items: [] }],
    payments: [{ id: 'payment-1', bookingId: 'booking-1', branchId: 'branch-1', branchName: 'Main',
      customerId: 'customer-1', method: 'CARD', status: 'PARTIAL', amount: '800.00',
      paidAt: new Date('2026-08-01T10:00:00.000Z'), voidedAt: null, refundedAmount: '100.00' },
    { id: 'payment-void', bookingId: 'booking-1', branchId: 'branch-1', branchName: 'Main',
      customerId: 'customer-1', method: 'CASH', status: 'VOID', amount: '50.00',
      paidAt: new Date('2026-08-01T10:00:00.000Z'), voidedAt: new Date('2026-08-01T11:00:00.000Z'),
      refundedAmount: '0.00' }],
    refunds: [{ id: 'refund-1', paymentId: 'payment-1', bookingId: 'booking-1', branchId: 'branch-1',
      branchName: 'Main', customerId: 'customer-1', amount: '100.00', createdAt: new Date('2026-08-03T00:00:00.000Z'),
      allocation: { bookingDiscountAmount: '100.00', items: [{ id: 'item-1', serviceId: 'service-1',
        serviceName: 'Color', subtotalAmount: '1000.00', discountAmount: '0.00' }] } }],
    commissions: [{ id: 'commission-1', branchId: 'branch-1', branchName: 'Main', bookingId: 'booking-1',
      bookingItemId: 'item-1', employeeId: 'employee-1', employeeName: 'May', serviceId: 'service-1',
      serviceName: 'Color', commissionAmount: '300.00', calculatedAt: new Date('2026-08-01T11:00:00.000Z'),
      periodStatus: 'LOCKED', approvalPeriods: [{ periodId: 'period-1',
        startsAt: range.dateFrom, endsAt: range.dateTo, status: 'LOCKED', approvedAmount: '300.00' }] }],
    commissionAdjustments: [{ id: 'adjustment-1', branchId: 'branch-1', branchName: 'Main', bookingId: 'booking-1',
      bookingItemId: 'item-1', employeeId: 'employee-1', employeeName: 'May', serviceId: 'service-1',
      serviceName: 'Color', adjustmentAmount: '-50.00', calculatedAt: new Date('2026-08-03T00:00:00.000Z'),
      periodId: 'period-2', periodStartsAt: range.dateFrom, periodEndsAt: range.dateTo, periodStatus: 'OPEN' }],
    customers: [{ id: 'customer-1', customerNumber: 'C-1', customerName: '=Injected',
      createdAt: new Date('2026-08-01T00:00:00.000Z'), createdInScope: true }],
    branches: [{ id: 'branch-1', name: 'Main', timezone: 'Asia/Bangkok' }],
    workingHours: [], timeOffs: [], holidays: [], truncated: false,
  }
}

describe('DashboardReportEngine', () => {
  const engine = new DashboardReportEngine()

  it('uses booking item snapshots and integer cents for overview revenue', () => {
    expect(engine.overview(snapshot(), range)).toMatchObject({ totalBookings: 2, completedBookings: 1,
      noShowBookings: 1, grossSales: 100000, discountTotal: 10000, taxTotal: 7000, netSales: 90000,
      paidAmount: 80000, refundedAmount: 10000, voidedAmount: 5000, outstandingAmount: 27000,
      commissionTotal: 25000, averageTicketSize: 90000, topService: 'Color', topEmployee: 'May' })
  })

  it('excludes VOID payments, subtracts refund ledger, and separates partial payments', () => {
    expect(engine.paymentSummary(snapshot())).toEqual({ paidAmount: 80000, partialAmount: 80000,
      outstandingAmount: 27000, refundedAmount: 10000, voidedAmount: 5000, netPaidAmount: 70000 })
    expect(engine.paymentMethodBreakdown(snapshot())).toEqual([{ method: 'CARD', paymentCount: 1, paidAmount: 80000 }])
  })

  it('uses immutable commission base plus signed adjustments', () => {
    expect(engine.commissionSummary(snapshot())).toEqual({ commissionTotal: 25000, baseCommissionTotal: 30000,
      commissionAdjustmentTotal: -5000, approvedCommissionTotal: 30000, lockedCommissionTotal: 30000 })
    expect(engine.commissionBy(snapshot(), 'period')).toEqual([
      { id: 'period-1', name: 'period-1', status: 'LOCKED', startsAt: range.dateFrom.toISOString(),
        endsAt: range.dateTo.toISOString(), baseCommissionTotal: 30000, commissionAdjustmentTotal: 0,
        commissionTotal: 30000 },
      { id: 'period-2', name: 'period-2', status: 'OPEN', startsAt: range.dateFrom.toISOString(),
        endsAt: range.dateTo.toISOString(), baseCommissionTotal: 0, commissionAdjustmentTotal: -5000,
        commissionTotal: -5000 },
    ])
  })

  it('allocates booking discounts to services deterministically before tax', () => {
    const base = snapshot(); const sale = base.sales[0]!
    const allocated: DashboardReportSnapshot = { ...base, refunds: [], sales: [{ ...sale, bookingDiscountAmount: '0.03', payments: [],
      items: [
        { ...sale.items[0]!, id: 'item-b', serviceId: 'service-b', serviceName: 'Service B',
          subtotalAmount: '1.00', totalAmount: '1.00', taxAmount: '0.00' },
        { ...sale.items[0]!, id: 'item-a', serviceId: 'service-a', serviceName: 'Service A',
          subtotalAmount: '1.00', totalAmount: '1.00', taxAmount: '0.00' },
      ] }] }
    const revenue = new Map(engine.servicePerformance(allocated)
      .map((row) => [String(row.serviceId), Number(row.revenue)]))
    expect(revenue).toEqual(new Map([['service-a', 99], ['service-b', 98]]))
    expect([...revenue.values()].reduce((sum, amount) => sum + amount, 0)).toBe(197)
  })

  it('attributes overview payments and refunds by their own ledger ranges', () => {
    const data = snapshot()
    const attributed: DashboardReportSnapshot = { ...data,
      payments: data.payments.map((payment) => payment.status === 'VOID' ? payment : { ...payment, amount: '200.00' }),
      refunds: data.refunds.map((refund) => ({ ...refund, amount: '50.00' })) }
    expect(engine.overview(attributed, range)).toMatchObject({ paidAmount: 20000, refundedAmount: 5000,
      voidedAmount: 5000, outstandingAmount: 27000 })
  })

  it('counts customers created in range before their first closed sale', () => {
    const data = snapshot(); const withLead: DashboardReportSnapshot = { ...data, customers: [...data.customers,
      { id: 'customer-2', customerNumber: 'C-2', customerName: 'New Lead',
        createdAt: new Date('2026-08-04T00:00:00.000Z'), createdInScope: true }] }
    expect(engine.customerAnalytics(withLead, range)).toMatchObject({ totalCustomers: 2, newCustomers: 2,
      returningCustomers: 0, averageSpendPerCustomer: 90000 })
  })

  it('intersects employee capacity with partial ranges and merges unavailable time', () => {
    const data = snapshot(); const partialRange = { dateFrom: new Date('2026-08-03T05:00:00.000Z'),
      dateTo: new Date('2026-08-03T10:00:00.000Z'), timezone: 'Asia/Bangkok', granularity: 'custom' as const }
    const capacity: DashboardReportSnapshot = { ...data,
      workingHours: [{ branchId: 'branch-1', employeeId: 'employee-1', dayOfWeek: 1,
        startTime: '09:00:00', endTime: '17:00:00', effectiveFrom: null, effectiveTo: null }],
      holidays: [{ branchId: 'branch-1', startsAt: new Date('2026-08-03T06:00:00.000Z'),
        endsAt: new Date('2026-08-03T07:00:00.000Z') }],
      timeOffs: [{ branchId: 'branch-1', employeeId: 'employee-1', startsAt: new Date('2026-08-03T06:30:00.000Z'),
        endsAt: new Date('2026-08-03T07:30:00.000Z') }] }
    expect(engine.bookingSummary(capacity, partialRange)).toMatchObject({ completedServiceMinutes: 60,
      scheduledWorkingMinutes: 210, employeeUtilizationRateBps: 2857 })
  })

  it('converts Bangkok date-only boundaries to UTC and rejects ranges over one year', () => {
    const clock = new FixedClock(new Date('2026-08-09T00:00:00.000Z'))
    const valid = resolveReportRange({ dateFrom: '2026-08-01', dateTo: '2026-08-31', timezone: 'Asia/Bangkok',
      granularity: 'daily' }, clock)
    expect(valid).toMatchObject({ ok: true, value: { dateFrom: new Date('2026-07-31T17:00:00.000Z'),
      dateTo: new Date('2026-08-31T17:00:00.000Z') } })
    expect(resolveReportRange({ dateFrom: '2025-01-01', dateTo: '2026-08-01', timezone: 'Asia/Bangkok',
      granularity: 'monthly' }, clock)).toMatchObject({ ok: false, error: { code: 'BUSINESS_RULE_VIOLATION' } })
  })

  it('sanitizes CSV and Excel formula injection', async () => {
    const exporter = new DashboardReportExporter(); const rows = engine.reportRows('customers', snapshot(), range)
    const csv = exporter.csv('customers', rows, undefined, 'Asia/Bangkok')
    expect(csv.ok).toBe(true)
    if (!csv.ok) return
    expect(csv.value.buffer.subarray(0, 3).toString('hex')).toBe('efbbbf')
    expect(csv.value.buffer.toString('utf8')).toContain("'=Injected")
    const xlsx = await exporter.excel('customers', rows, undefined, 'Asia/Bangkok')
    expect(xlsx.ok).toBe(true)
    if (!xlsx.ok) return
    const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(xlsx.value.buffer as never)
    expect(workbook.worksheets[0]!.getCell('C2').value).toBe("'=Injected")
  })

  it('exports stable headers when a report has no rows', () => {
    const exported = new DashboardReportExporter().csv('sales', [], undefined, 'Asia/Bangkok', { netSales: 0 })
    const content = exported.ok ? exported.value.buffer.toString('utf8') : ''
    expect(content).toContain('"date","bookingId","bookingNumber"')
    expect(content).toContain('"summaryMetric","summaryValue"\r\n"netSales","0"')
  })
})
