import { randomUUID } from 'node:crypto'
import { Prisma, PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { DashboardReportPolicy, PolicyEngine } from '../../src/application/foundation/policy.js'
import { DomainEventFactory, InProcessDomainEventDispatcher } from '../../src/domain/foundation/domain-events.js'
import { FixedClock } from '../../src/infrastructure/foundation/system-adapters.js'
import { createPrismaRepositories } from '../../src/infrastructure/repositories/prisma-repositories.js'
import { DashboardReportEngine } from '../../src/modules/dashboard-report/dashboard-report.engine.js'
import { DashboardReportExporter } from '../../src/modules/dashboard-report/dashboard-report.exporter.js'
import { DashboardReportOperations, GenerateSalesReport } from '../../src/modules/dashboard-report/dashboard-report.use-cases.js'

const databaseUrl = process.env.TEST_DATABASE_URL
const database = databaseUrl ? new PrismaClient({ datasources: { db: { url: databaseUrl } } }) : null
const prefix = `Dashboard Integration ${randomUUID()}`

describe.runIf(database !== null)('Dashboard report PostgreSQL integration', () => {
  let organizationId: string; let otherOrganizationId: string; let branchId: string; let siblingBranchId: string

  beforeAll(async () => {
    await database!.$connect()
    const organization = await database!.organization.create({ data: { name: prefix, timezone: 'Asia/Bangkok', currency: 'THB' } })
    const other = await database!.organization.create({ data: { name: `${prefix} Other`, timezone: 'Asia/Bangkok', currency: 'THB' } })
    organizationId = organization.id; otherOrganizationId = other.id
    const [branch, sibling, otherBranch] = await Promise.all([
      database!.branch.create({ data: { organizationId, code: 'MAIN', name: 'Main', countryCode: 'TH' } }),
      database!.branch.create({ data: { organizationId, code: 'SECOND', name: 'Second', countryCode: 'TH' } }),
      database!.branch.create({ data: { organizationId: otherOrganizationId, code: 'OTHER', name: 'Other', countryCode: 'TH' } }),
    ])
    branchId = branch.id; siblingBranchId = sibling.id
    const main = await seedSale(organizationId, branch.id, '1000.00', true)
    await seedSale(organizationId, sibling.id, '2000.00', false)
    await seedSale(otherOrganizationId, otherBranch.id, '9000.00', false)
    await Promise.all(['CANCELLED', 'NO_SHOW'].map((status, index) => database!.booking.create({ data: {
      branchId: branch.id, customerId: main.customerId, createdByUserId: main.userId,
      bookingNumber: `B-${status}-${randomUUID().slice(0, 8)}`, status: status as 'CANCELLED' | 'NO_SHOW', source: 'PHONE',
      startsAt: new Date(`2026-08-0${index + 3}T02:00:00.000Z`),
      endsAt: new Date(`2026-08-0${index + 3}T03:00:00.000Z`),
      ...(status === 'CANCELLED' ? { cancelledAt: new Date('2026-08-03T01:00:00.000Z') } : {}),
    } })))
  })

  afterAll(async () => {
    if (!organizationId || !otherOrganizationId) {
      await database!.$disconnect()
      return
    }
    const ids = [organizationId, otherOrganizationId]
    await database!.commissionApproval.deleteMany({ where: { organizationId: { in: ids } } })
    await database!.commissionAdjustment.deleteMany({ where: { organizationId: { in: ids } } })
    await database!.commissionHistory.deleteMany({ where: { bookingItem: { booking: { branch: { organizationId: { in: ids } } } } } })
    await database!.commissionPeriod.deleteMany({ where: { organizationId: { in: ids } } })
    await database!.commissionTier.deleteMany({ where: { commissionRule: { organizationId: { in: ids } } } })
    await database!.commissionRule.deleteMany({ where: { organizationId: { in: ids } } })
    await database!.paymentRefund.deleteMany({ where: { payment: { booking: { branch: { organizationId: { in: ids } } } } } })
    await database!.payment.deleteMany({ where: { booking: { branch: { organizationId: { in: ids } } } } })
    await database!.bookingDiscount.deleteMany({ where: { booking: { branch: { organizationId: { in: ids } } } } })
    await database!.bookingItem.deleteMany({ where: { booking: { branch: { organizationId: { in: ids } } } } })
    await database!.booking.deleteMany({ where: { branch: { organizationId: { in: ids } } } })
    await database!.employeeBranch.deleteMany({ where: { branch: { organizationId: { in: ids } } } })
    await database!.employee.deleteMany({ where: { organizationId: { in: ids } } })
    await database!.service.deleteMany({ where: { organizationId: { in: ids } } })
    await database!.serviceCategory.deleteMany({ where: { organizationId: { in: ids } } })
    await database!.customer.deleteMany({ where: { organizationId: { in: ids } } })
    await database!.user.deleteMany({ where: { organizationId: { in: ids } } })
    await database!.branch.deleteMany({ where: { organizationId: { in: ids } } })
    await database!.organization.deleteMany({ where: { id: { in: ids } } })
    await database!.$disconnect()
  })

  async function seedSale(orgId: string, selectedBranchId: string, amount: string, financialLedger: boolean) {
    const taxAmount = new Prisma.Decimal(amount).mul('0.07').toFixed(2)
    const totalAmount = new Prisma.Decimal(amount).add(taxAmount).toFixed(2)
    const user = await database!.user.create({ data: { organizationId: orgId, email: `${randomUUID()}@report.test`,
      passwordHash: 'integration-test-password-hash', displayName: 'Owner' } })
    const customer = await database!.customer.create({ data: { organizationId: orgId, preferredBranchId: selectedBranchId,
      customerNumber: `C-${randomUUID()}`, firstName: financialLedger ? '=Formula' : 'Jane' } })
    const category = await database!.serviceCategory.create({ data: { organizationId: orgId, name: `Hair ${randomUUID()}` } })
    const service = await database!.service.create({ data: { organizationId: orgId, categoryId: category.id,
      code: `S-${randomUUID().slice(0, 12)}`, name: 'Color', durationMinutes: 60, price: amount,
      taxType: 'VAT', taxMode: 'EXCLUDED', taxRate: '7.00' } })
    const employee = await database!.employee.create({ data: { organizationId: orgId,
      employeeCode: `E-${randomUUID()}`, displayName: 'May' } })
    await database!.employeeBranch.create({ data: { employeeId: employee.id, branchId: selectedBranchId, isPrimary: true } })
    const startsAt = new Date('2026-08-01T02:00:00.000Z'); const closedAt = new Date('2026-08-01T10:00:00.000Z')
    const booking = await database!.booking.create({ data: { branchId: selectedBranchId, customerId: customer.id,
      createdByUserId: user.id, closedByUserId: user.id, bookingNumber: `B-${randomUUID()}`, status: 'COMPLETED',
      source: 'PHONE', startsAt, endsAt: new Date('2026-08-01T03:00:00.000Z'), completedAt: closedAt,
      saleClosedAt: closedAt, paymentStatus: financialLedger ? 'PARTIAL' : 'PENDING' } })
    const item = await database!.bookingItem.create({ data: { bookingId: booking.id, serviceId: service.id,
      employeeId: employee.id, serviceName: 'Color', status: 'COMPLETED', startsAt,
      endsAt: new Date('2026-08-01T03:00:00.000Z'), durationMinutes: 60, quantity: 1, unitPrice: amount,
      discountAmount: '0.00', subtotalAmount: amount, taxType: 'VAT', taxMode: 'EXCLUDED', taxRate: '7.00',
      taxAmount, totalAmount } })
    if (!financialLedger) return { userId: user.id, customerId: customer.id }
    await database!.bookingDiscount.create({ data: { bookingId: booking.id, description: 'Snapshot discount',
      discountType: 'FIXED', discountValue: '100.00', discountAmount: '100.00' } })
    const payment = await database!.payment.create({ data: { bookingId: booking.id, receivedByUserId: user.id,
      amount: '800.00', currency: 'THB', method: 'CARD', status: 'PARTIAL', paidAt: closedAt } })
    const refund = await database!.paymentRefund.create({ data: { paymentId: payment.id, refundedByUserId: user.id,
      amount: '100.00', currency: 'THB', reason: 'Adjustment', createdAt: new Date('2026-08-02T00:00:00.000Z') } })
    const rule = await database!.commissionRule.create({ data: { organizationId: orgId, branchId: selectedBranchId,
      employeeId: employee.id, serviceId: service.id, name: '30 percent', type: 'PERCENT', basis: 'PAID_AMOUNT',
      percentageRate: '30.00', effectiveFrom: new Date('2026-01-01T00:00:00.000Z') } })
    const history = await database!.commissionHistory.create({ data: { bookingItemId: item.id, employeeId: employee.id,
      commissionRuleId: rule.id, paymentId: payment.id, ruleName: rule.name, type: 'PERCENT', basis: 'PAID_AMOUNT',
      baseAmount: '700.00', percentageRate: '30.00', commissionAmount: '210.00', calculatedAt: closedAt } })
    const period = await database!.commissionPeriod.create({ data: { organizationId: orgId, branchId: selectedBranchId,
      startsAt: new Date('2026-07-31T17:00:00.000Z'), endsAt: new Date('2026-08-31T17:00:00.000Z'),
      status: 'LOCKED', approvedByUserId: user.id, approvedAt: closedAt, lockedByUserId: user.id, lockedAt: closedAt } })
    await database!.commissionApproval.create({ data: { organizationId: orgId, branchId: selectedBranchId,
      commissionHistoryId: history.id, commissionPeriodId: period.id, approvedByUserId: user.id,
      approvedAmount: '210.00', reason: 'Approved', approvedAt: closedAt } })
    await database!.commissionAdjustment.create({ data: { organizationId: orgId, branchId: selectedBranchId,
      commissionHistoryId: history.id, commissionPeriodId: period.id, bookingItemId: item.id, employeeId: employee.id,
      commissionRuleId: rule.id, paymentRefundId: refund.id, createdByUserId: user.id, type: 'REFUND', ruleName: rule.name,
      commissionType: 'PERCENT', basis: 'PAID_AMOUNT', baseAmount: '100.00', percentageRate: '30.00',
      previousAmount: '210.00', adjustmentAmount: '-30.00', resultingAmount: '180.00', reason: 'Refund adjustment',
      calculatedAt: new Date('2026-08-02T00:00:00.000Z') } })
    return { userId: user.id, customerId: customer.id }
  }

  const query = (branchIds: readonly string[] | null) => ({ organizationId, branchIds,
    dateFrom: new Date('2026-07-31T17:00:00.000Z'), dateTo: new Date('2026-08-31T17:00:00.000Z'), limit: 100 })

  it('aggregates completed sales, payment/refund, and commission ledgers from real PostgreSQL rows', async () => {
    const snapshot = await createPrismaRepositories(database!).dashboardReports.loadSnapshot(query([branchId]))
    const engine = new DashboardReportEngine(); const summary = engine.overview(snapshot, { ...query([branchId]),
      timezone: 'Asia/Bangkok', granularity: 'daily' })
    expect(summary).toMatchObject({ totalBookings: 3, completedBookings: 1, cancelledBookings: 1,
      noShowBookings: 1, grossSales: 100000, discountTotal: 10000,
      netSales: 90000, paidAmount: 80000, refundedAmount: 10000, outstandingAmount: 27000,
      commissionTotal: 18000, topBranch: 'Main' })
  })

  it('enforces organization and authorized branch scopes in every underlying query', async () => {
    const repository = createPrismaRepositories(database!).dashboardReports
    const branch = await repository.loadSnapshot(query([branchId]))
    expect(branch.sales).toHaveLength(1); expect(branch.branches.map((item) => item.id)).toEqual([branchId])
    const organization = await repository.loadSnapshot(query(null))
    expect(organization.sales).toHaveLength(2)
    expect(organization.sales.some((item) => item.branchId === siblingBranchId)).toBe(true)
    expect(organization.sales.every((item) => item.branchId === branchId || item.branchId === siblingBranchId)).toBe(true)
  })

  it('exports repository-backed rows to injection-safe CSV and Excel buffers', async () => {
    const snapshot = await createPrismaRepositories(database!).dashboardReports.loadSnapshot(query([branchId]))
    const engine = new DashboardReportEngine(); const exporter = new DashboardReportExporter()
    const rows = engine.reportRows('customers', snapshot, { dateFrom: query([branchId]).dateFrom,
      dateTo: query([branchId]).dateTo, timezone: 'Asia/Bangkok', granularity: 'daily' })
    const csv = exporter.csv('customers', rows, undefined, 'Asia/Bangkok')
    expect(csv.ok && csv.value.buffer.toString('utf8')).toContain("'=Formula")
    const xlsx = await exporter.excel('customers', rows, undefined, 'Asia/Bangkok')
    expect(xlsx.ok && xlsx.value.buffer.length > 1000).toBe(true)
  })

  it('derives dashboard slices and paginated reports from the same real facts', async () => {
    const repository = createPrismaRepositories(database!).dashboardReports
    const snapshot = await repository.loadSnapshot(query([branchId])); const engine = new DashboardReportEngine()
    expect(engine.bookingStatusBreakdown(snapshot)).toEqual([
      { status: 'CANCELLED', count: 1 }, { status: 'COMPLETED', count: 1 }, { status: 'NO_SHOW', count: 1 },
    ])
    expect(engine.paymentSummary(snapshot)).toMatchObject({ paidAmount: 80000, refundedAmount: 10000,
      netPaidAmount: 70000, outstandingAmount: 27000 })
    expect(engine.commissionSummary(snapshot)).toMatchObject({ commissionTotal: 18000,
      baseCommissionTotal: 21000, commissionAdjustmentTotal: -3000, lockedCommissionTotal: 18000 })
    expect(engine.employeePerformance(snapshot, { ...query([branchId]), timezone: 'Asia/Bangkok', granularity: 'daily' })[0])
      .toMatchObject({ employeeName: 'May', revenue: 90000, bookingCount: 1, commissionTotal: 18000 })
    expect(engine.servicePerformance(snapshot)[0]).toMatchObject({ serviceName: 'Color', revenue: 90000,
      serviceCount: 1, refundImpact: 10000 })
    expect(engine.customerAnalytics(snapshot, { ...query([branchId]), timezone: 'Asia/Bangkok', granularity: 'daily' }))
      .toMatchObject({ totalCustomers: 1, newCustomers: 1, returningCustomers: 0 })
    expect(engine.branchPerformance(snapshot)[0]).toMatchObject({ branchName: 'Main', netSales: 90000,
      bookingCount: 3, paidAmount: 80000, refundedAmount: 10000, commissionTotal: 18000 })

    const clock = new FixedClock(new Date('2026-08-09T00:00:00.000Z'))
    const operations = new DashboardReportOperations({ repository, policyEngine: new PolicyEngine(),
      policy: new DashboardReportPolicy(), eventFactory: new DomainEventFactory(clock, { generate: randomUUID }),
      events: new InProcessDomainEventDispatcher(), clock, engine, exporter: new DashboardReportExporter() })
    const report = await new GenerateSalesReport(operations).execute({ userId: randomUUID(), organizationId,
      grants: [{ branchId, permissions: ['report.read', 'sales.summary.read'] }] }, {
      dateFrom: '2026-08-01', dateTo: '2026-08-31', timezone: 'Asia/Bangkok', branchId,
      granularity: 'daily', page: 1, pageSize: 1, sort: 'date', order: 'desc' })
    expect(report).toMatchObject({ ok: true, value: { reportType: 'sales', page: 1, pageSize: 1,
      totalItems: 1, totalPages: 1 } })
    expect(report.ok && typeof report.value.rows[0]?.bookingNumber).toBe('string')
  })

  it('uses half-open UTC ranges at the sale-close boundary', async () => {
    const repository = createPrismaRepositories(database!).dashboardReports
    const boundary = new Date('2026-08-01T10:00:00.000Z')
    expect((await repository.loadSnapshot({ organizationId, branchIds: [branchId],
      dateFrom: new Date('2026-08-01T09:00:00.000Z'), dateTo: boundary, limit: 100 })).sales).toHaveLength(0)
    expect((await repository.loadSnapshot({ organizationId, branchIds: [branchId], dateFrom: boundary,
      dateTo: new Date('2026-08-01T10:00:00.001Z'), limit: 100 })).sales).toHaveLength(1)
  })
})
