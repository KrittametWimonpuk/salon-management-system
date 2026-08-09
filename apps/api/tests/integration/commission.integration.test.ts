import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { CommissionPolicy, PolicyEngine, type PolicySubject } from '../../src/application/foundation/policy.js'
import { DomainEventFactory, InProcessDomainEventDispatcher } from '../../src/domain/foundation/domain-events.js'
import { FixedClock } from '../../src/infrastructure/foundation/system-adapters.js'
import { createPrismaRepositories } from '../../src/infrastructure/repositories/prisma-repositories.js'
import { PrismaTransactionManager } from '../../src/infrastructure/transaction/prisma-transaction-manager.js'
import { CommissionFinancialEngine } from '../../src/modules/commission/commission.engine.js'
import { CommissionOperations, type CommissionDependencies,
  type CommissionUseCaseContext } from '../../src/modules/commission/commission.use-cases.js'
import { PaymentFinancialEngine } from '../../src/modules/pos-payment/payment.engine.js'

const databaseUrl = process.env.TEST_DATABASE_URL
const database = databaseUrl ? new PrismaClient({ datasources: { db: { url: databaseUrl } } }) : null
const now = new Date('2026-08-09T05:00:00.000Z')
const august = { dateFrom: '2026-08-01T00:00:00.000Z', dateTo: '2026-09-01T00:00:00.000Z' }
const prefix = 'Commission Integration'
const permissions = new Set(['commission.preview', 'commission.calculate', 'commission.read', 'commission.recalculate',
  'commission.adjust', 'commission.approve', 'commission.lock', 'commission.rule.read', 'commission.rule.manage',
  'commission.summary.read'])

describe.runIf(database !== null)('Commission PostgreSQL integration', () => {
  let organizationId: string; let branchId: string; let userId: string; let employeeId: string
  let bookingId: string; let bookingItemId: string; let paymentId: string; let operations: CommissionOperations
  let transactions: PrismaTransactionManager

  beforeAll(async () => database!.$connect())
  beforeEach(async () => {
    const organization = await database!.organization.create({ data: { name: `${prefix} ${randomUUID()}`,
      timezone: 'Asia/Bangkok', currency: 'THB' } }); organizationId = organization.id
    const branch = await database!.branch.create({ data: { organizationId, code: 'MAIN', name: 'Main', countryCode: 'TH' } })
    branchId = branch.id
    const user = await database!.user.create({ data: { organizationId, email: `${randomUUID()}@commission.test`,
      passwordHash: 'integration-test-password-hash', displayName: 'Manager' } }); userId = user.id
    const customer = await database!.customer.create({ data: { organizationId, preferredBranchId: branchId,
      customerNumber: `C-${randomUUID()}`, firstName: 'Jane' } })
    const category = await database!.serviceCategory.create({ data: { organizationId, name: `Hair ${randomUUID()}` } })
    const service = await database!.service.create({ data: { organizationId, categoryId: category.id,
      code: `S-${randomUUID().slice(0, 12)}`, name: 'Color', durationMinutes: 60, price: '1070.00',
      taxType: 'VAT', taxMode: 'INCLUDED', taxRate: '7.00' } })
    const employee = await database!.employee.create({ data: { organizationId, employeeCode: `E-${randomUUID()}`,
      displayName: 'May' } }); employeeId = employee.id
    bookingId = randomUUID(); bookingItemId = randomUUID(); paymentId = randomUUID()
    await database!.booking.create({ data: { id: bookingId, branchId, customerId: customer.id, createdByUserId: userId,
      bookingNumber: `BKG-${randomUUID().replaceAll('-', '').slice(0, 20)}`, status: 'COMPLETED', source: 'PHONE',
      startsAt: new Date('2026-08-09T02:00:00Z'), endsAt: new Date('2026-08-09T03:00:00Z'), completedAt: now,
      paymentStatus: 'PAID', saleClosedAt: now, closedByUserId: userId,
      items: { create: { id: bookingItemId, serviceId: service.id, employeeId, serviceName: 'Color', status: 'COMPLETED',
        startsAt: new Date('2026-08-09T02:00:00Z'), endsAt: new Date('2026-08-09T03:00:00Z'), durationMinutes: 60,
        quantity: 1, unitPrice: '1070.00', discountAmount: '0.00', subtotalAmount: '1070.00', taxType: 'VAT',
        taxMode: 'INCLUDED', taxRate: '7.00', taxAmount: '70.00', totalAmount: '1070.00' } },
      payments: { create: { id: paymentId, receivedByUserId: userId, amount: '1070.00', currency: 'THB',
        method: 'CASH', status: 'PAID', paidAt: now } } } })
    await database!.commissionRule.create({ data: { organizationId, branchId, employeeId, serviceId: service.id,
      name: 'Stylist 30%', type: 'PERCENT', basis: 'PAID_AMOUNT', percentageRate: '30.00', priority: 100,
      effectiveFrom: new Date('2026-01-01') } })
    transactions = new PrismaTransactionManager(database!)
    const clock = new FixedClock(now); const repositories = createPrismaRepositories(database!)
    const dependencies: CommissionDependencies = { repository: repositories.commissions, payments: repositories.payments,
      transactions, policyEngine: new PolicyEngine(), policy: new CommissionPolicy(),
      eventFactory: new DomainEventFactory(clock, { generate: randomUUID }), events: new InProcessDomainEventDispatcher(),
      clock, ids: { generate: randomUUID }, engine: new CommissionFinancialEngine(),
      paymentFinancials: new PaymentFinancialEngine() }
    operations = new CommissionOperations(dependencies)
  })

  afterEach(async () => {
    const organizations = await database!.organization.findMany({ where: { name: { startsWith: prefix } }, select: { id: true } })
    const ids = organizations.map(({ id }) => id); if (!ids.length) return
    await database!.commissionApproval.deleteMany({ where: { organizationId: { in: ids } } })
    await database!.commissionAdjustment.deleteMany({ where: { organizationId: { in: ids } } })
    await database!.commissionPeriod.deleteMany({ where: { organizationId: { in: ids } } })
    await database!.commissionHistory.deleteMany({ where: { employee: { organizationId: { in: ids } } } })
    await database!.commissionTier.deleteMany({ where: { commissionRule: { organizationId: { in: ids } } } })
    await database!.commissionRule.deleteMany({ where: { organizationId: { in: ids } } })
    await database!.paymentRefund.deleteMany({ where: { payment: { booking: { branch: { organizationId: { in: ids } } } } } })
    await database!.payment.deleteMany({ where: { booking: { branch: { organizationId: { in: ids } } } } })
    await database!.bookingItem.deleteMany({ where: { booking: { branch: { organizationId: { in: ids } } } } })
    await database!.booking.deleteMany({ where: { branch: { organizationId: { in: ids } } } })
    await database!.employee.deleteMany({ where: { organizationId: { in: ids } } })
    await database!.service.deleteMany({ where: { organizationId: { in: ids } } })
    await database!.serviceCategory.deleteMany({ where: { organizationId: { in: ids } } })
    await database!.customer.deleteMany({ where: { organizationId: { in: ids } } })
    await database!.user.deleteMany({ where: { organizationId: { in: ids } } })
    await database!.branch.deleteMany({ where: { organizationId: { in: ids } } })
    await database!.organization.deleteMany({ where: { id: { in: ids } } })
  })
  afterAll(async () => database!.$disconnect())

  function context(): CommissionUseCaseContext {
    const subject: PolicySubject = { userId, organizationId, branchIds: new Set([branchId]), permissions }
    return { subject, branchId }
  }

  it('has the additive ledger migration installed', async () => {
    const tables = await database!.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name IN ('CommissionAdjustment', 'CommissionApproval', 'CommissionPeriod')`
    expect(tables.map(({ table_name }) => table_name).sort())
      .toEqual(['CommissionAdjustment', 'CommissionApproval', 'CommissionPeriod'])
  })

  it('previews and calculates immutable commission from closed-sale snapshots', async () => {
    expect(await operations.previewBooking(context(), bookingId, august)).toMatchObject({ ok: true, value: {
      netPaidAmount: '1070.00', totalCommissionAmount: '300.00', items: [{ baseAmount: '1000.00' }] } })
    expect(await operations.calculateBooking(context(), bookingId, august)).toMatchObject({ ok: true,
      value: [{ commissionAmount: '300.00', effectiveAmount: '300.00' }] })
    expect(await database!.commissionHistory.count({ where: { bookingItemId } })).toBe(1)
  })

  it('prevents concurrent duplicate calculation with serializable advisory locks', async () => {
    const results = await Promise.all([operations.calculateBooking(context(), bookingId, august),
      operations.calculateBooking(context(), bookingId, august)])
    expect(results.filter(({ ok }) => ok)).toHaveLength(1)
    expect(await database!.commissionHistory.count({ where: { bookingItemId } })).toBe(1)
  })

  it('locks an approved period and denies recalculation', async () => {
    const calculated = await operations.calculateBooking(context(), bookingId, august); if (!calculated.ok) return
    const commissionId = calculated.value[0]!.id
    expect(await operations.approve(context(), commissionId, { ...august, reason: 'Reviewed' }))
      .toMatchObject({ ok: true, value: { approvedAmount: '300.00' } })
    expect(await operations.lockPeriod(context(), { ...august, reason: 'Month closed' }))
      .toMatchObject({ ok: true, value: { status: 'LOCKED' } })
    expect(await operations.recalculateBooking(context(), bookingId, { ...august, reason: 'Try again' }))
      .toMatchObject({ ok: false, error: { code: 'BUSINESS_RULE_VIOLATION' } })
  })

  it('creates an immutable recalculation delta and summarizes the effective amount', async () => {
    const calculated = await operations.calculateBooking(context(), bookingId, august); if (!calculated.ok) return
    await database!.commissionRule.updateMany({ where: { organizationId }, data: { percentageRate: '40.00' } })
    expect(await operations.recalculateBooking(context(), bookingId, { ...august, reason: 'Rule correction' }))
      .toMatchObject({ ok: true, value: [{ type: 'RECALCULATION', adjustmentAmount: '100.00',
        previousAmount: '300.00', resultingAmount: '400.00' }] })
    expect(await operations.summary(context(), august, employeeId)).toMatchObject({ ok: true, value: [{
      baseCommissionAmount: '300.00', adjustmentAmount: '100.00', effectiveCommissionAmount: '400.00' }] })
    expect((await database!.commissionHistory.findUniqueOrThrow({ where: { bookingItemId } })).commissionAmount.toFixed(2))
      .toBe('300.00')
  })

  it('posts refund after lock as a negative adjustment in the current open period', async () => {
    const calculated = await operations.calculateBooking(context(), bookingId, august); if (!calculated.ok) return
    await operations.approve(context(), calculated.value[0]!.id, { ...august, reason: 'Reviewed' })
    await operations.lockPeriod(context(), { ...august, reason: 'Month closed' })
    const refundId = randomUUID(); const refundedAt = new Date('2026-09-05T05:00:00Z')
    await database!.paymentRefund.create({ data: { id: refundId, paymentId, refundedByUserId: userId,
      amount: '535.00', currency: 'THB', reason: 'Half refund', createdAt: refundedAt } })
    await database!.payment.update({ where: { id: paymentId }, data: { status: 'PARTIAL', refundedAt } })
    await database!.booking.update({ where: { id: bookingId }, data: { paymentStatus: 'PARTIAL' } })
    expect(await operations.applyRefundAdjustment(context(), refundId)).toMatchObject({ ok: true,
      value: [{ type: 'REFUND', adjustmentAmount: '-150.00', resultingAmount: '150.00' }] })
    const adjustment = await database!.commissionAdjustment.findFirstOrThrow({ where: { paymentRefundId: refundId },
      include: { commissionPeriod: true } })
    expect(adjustment.commissionPeriod.status).toBe('OPEN')
    expect(adjustment.commissionPeriod.startsAt.toISOString()).toBe('2026-09-01T00:00:00.000Z')
    expect((await database!.commissionHistory.findUniqueOrThrow({ where: { bookingItemId } })).commissionAmount.toFixed(2))
      .toBe('300.00')
    const september = { dateFrom: '2026-09-01T00:00:00.000Z', dateTo: '2026-10-01T00:00:00.000Z' }
    expect(await operations.summary(context(), august)).toMatchObject({ ok: true,
      value: [{ effectiveCommissionAmount: '300.00', approvedCommissionAmount: '300.00' }] })
    expect(await operations.summary(context(), september)).toMatchObject({ ok: true,
      value: [{ baseCommissionAmount: '0.00', adjustmentAmount: '-150.00', effectiveCommissionAmount: '-150.00' }] })
    expect(await operations.approve(context(), calculated.value[0]!.id, { ...september, reason: 'Refund reviewed' }))
      .toMatchObject({ ok: true, value: { approvedAmount: '-150.00' } })
    expect(await operations.lockPeriod(context(), { ...september, reason: 'Adjustment period closed' }))
      .toMatchObject({ ok: true, value: { status: 'LOCKED' } })
  })

  it('does not reveal commission records across tenant or branch scope', async () => {
    const calculated = await operations.calculateBooking(context(), bookingId, august); if (!calculated.ok) return
    const isolated: CommissionUseCaseContext = { branchId: randomUUID(), subject: { userId, organizationId: randomUUID(),
      branchIds: new Set(), permissions } }
    expect(await operations.get(isolated, calculated.value[0]!.id))
      .toMatchObject({ ok: false, error: { code: 'TENANT_ISOLATION' } })
  })

  it('rolls back an immutable calculation after a technical failure', async () => {
    const repositories = createPrismaRepositories(database!); const rule = await database!.commissionRule.findFirstOrThrow({ where: { organizationId } })
    await expect(transactions.withTransaction(async ({ commissions }) => {
      await commissions.createHistory({ id: randomUUID(), bookingItemId, employeeId, commissionRuleId: rule.id,
        paymentId: null, ruleName: rule.name, type: 'PERCENT', basis: 'PAID_AMOUNT', baseAmount: '1000.00',
        percentageRate: '30.00', fixedAmount: null, commissionAmount: '300.00', calculatedAt: now })
      throw new Error('technical rollback')
    })).rejects.toThrow('technical rollback')
    expect(await repositories.commissions.findHistoryByBookingItem({ organizationId, branchId }, bookingItemId)).toBeNull()
  })
})
