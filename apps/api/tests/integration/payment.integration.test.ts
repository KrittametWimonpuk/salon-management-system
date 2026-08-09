import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { PaymentPolicy, PolicyEngine, type PolicySubject } from '../../src/application/foundation/policy.js'
import { DomainEventFactory, InProcessDomainEventDispatcher } from '../../src/domain/foundation/domain-events.js'
import { FixedClock } from '../../src/infrastructure/foundation/system-adapters.js'
import { createPrismaRepositories } from '../../src/infrastructure/repositories/prisma-repositories.js'
import { PrismaTransactionManager } from '../../src/infrastructure/transaction/prisma-transaction-manager.js'
import { PaymentFinancialEngine } from '../../src/modules/pos-payment/payment.engine.js'
import { PaymentOperations, type PaymentDependencies,
  type PaymentUseCaseContext } from '../../src/modules/pos-payment/payment.use-cases.js'

const databaseUrl = process.env.TEST_DATABASE_URL
const database = databaseUrl ? new PrismaClient({ datasources: { db: { url: databaseUrl } } }) : null
const now = new Date('2026-08-08T00:00:00.000Z')
const prefix = 'Payment Integration'
const permissions = new Set(['payment.create', 'payment.read', 'payment.void', 'payment.refund',
  'payment.checkout', 'payment.close_sale', 'pos.read', 'pos.manage'])

describe.runIf(database !== null)('POS and Payment PostgreSQL integration', () => {
  let organizationId: string
  let otherOrganizationId: string
  let branchId: string
  let siblingBranchId: string
  let otherBranchId: string
  let userId: string
  let customerId: string
  let serviceId: string
  let employeeId: string
  let bookingId: string
  let operations: PaymentOperations
  let transactions: PrismaTransactionManager

  beforeAll(async () => database!.$connect())
  beforeEach(async () => {
    const primary = await database!.organization.create({ data: { name: `${prefix} ${randomUUID()}`,
      timezone: 'Asia/Bangkok', currency: 'THB' } })
    const other = await database!.organization.create({ data: { name: `${prefix} Other ${randomUUID()}`,
      timezone: 'Asia/Bangkok', currency: 'THB' } })
    organizationId = primary.id; otherOrganizationId = other.id
    const [branch, sibling, otherBranch] = await Promise.all([
      database!.branch.create({ data: { organizationId, code: 'MAIN', name: 'Main', countryCode: 'TH' } }),
      database!.branch.create({ data: { organizationId, code: 'SECOND', name: 'Second', countryCode: 'TH' } }),
      database!.branch.create({ data: { organizationId: otherOrganizationId, code: 'OTHER', name: 'Other', countryCode: 'TH' } }),
    ])
    branchId = branch.id; siblingBranchId = sibling.id; otherBranchId = otherBranch.id
    const user = await database!.user.create({ data: { organizationId, email: `${randomUUID()}@payment.test`,
      passwordHash: 'integration-test-password-hash', displayName: 'Cashier' } }); userId = user.id
    const customer = await database!.customer.create({ data: { organizationId, preferredBranchId: branchId,
      customerNumber: `C-${randomUUID()}`, firstName: 'Jane', phone: `08${Date.now()}` } }); customerId = customer.id
    const category = await database!.serviceCategory.create({ data: { organizationId, name: `Hair ${randomUUID()}` } })
    const service = await database!.service.create({ data: { organizationId, categoryId: category.id,
      code: `S-${randomUUID().slice(0, 12)}`, name: 'Salon Service', durationMinutes: 60, price: '535.00',
      taxType: 'VAT', taxMode: 'INCLUDED', taxRate: '7.00' } }); serviceId = service.id
    const employee = await database!.employee.create({ data: { organizationId, employeeCode: `E-${randomUUID()}`,
      displayName: 'May' } }); employeeId = employee.id
    bookingId = await createBooking('COMPLETED', true)
    const clock = new FixedClock(now); transactions = new PrismaTransactionManager(database!)
    const dependencies: PaymentDependencies = { repository: createPrismaRepositories(database!).payments,
      transactions, policyEngine: new PolicyEngine(), policy: new PaymentPolicy(),
      eventFactory: new DomainEventFactory(clock, { generate: randomUUID }), events: new InProcessDomainEventDispatcher(),
      clock, ids: { generate: randomUUID }, financials: new PaymentFinancialEngine() }
    operations = new PaymentOperations(dependencies)
  })

  afterEach(async () => {
    const organizations = await database!.organization.findMany({ where: { name: { startsWith: prefix } }, select: { id: true } })
    const ids = organizations.map(({ id }) => id); if (!ids.length) return
    await database!.paymentRefund.deleteMany({ where: { payment: { booking: { branch: { organizationId: { in: ids } } } } } })
    await database!.payment.deleteMany({ where: { booking: { branch: { organizationId: { in: ids } } } } })
    await database!.bookingDiscount.deleteMany({ where: { booking: { branch: { organizationId: { in: ids } } } } })
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

  async function createBooking(status: 'COMPLETED' | 'IN_PROGRESS', discount: boolean) {
    const id = randomUUID(); const startsAt = new Date('2026-08-10T02:00:00.000Z')
    await database!.booking.create({ data: { id, branchId, customerId, createdByUserId: userId,
      bookingNumber: `BKG-${id.replaceAll('-', '').slice(0, 20)}`, status, source: 'PHONE', startsAt,
      endsAt: new Date('2026-08-10T03:30:00.000Z'), completedAt: status === 'COMPLETED' ? now : null,
      items: { create: [{ id: randomUUID(), serviceId, employeeId, serviceName: 'Included Service', status: 'COMPLETED',
        startsAt, endsAt: new Date('2026-08-10T03:00:00.000Z'), durationMinutes: 60, quantity: 1,
        unitPrice: '535.00', discountAmount: '0.00', subtotalAmount: '535.00', taxType: 'VAT', taxMode: 'INCLUDED',
        taxRate: '7.00', taxAmount: '35.00', totalAmount: '535.00' },
      { id: randomUUID(), serviceId, employeeId, serviceName: 'Excluded Service', status: 'COMPLETED',
        startsAt: new Date('2026-08-10T03:00:00.000Z'), endsAt: new Date('2026-08-10T03:30:00.000Z'),
        durationMinutes: 30, quantity: 1, unitPrice: '200.00', discountAmount: '0.00', subtotalAmount: '200.00',
        taxType: 'VAT', taxMode: 'EXCLUDED', taxRate: '7.00', taxAmount: '14.00', totalAmount: '214.00' }] },
      ...(discount ? { discounts: { create: { promotionCode: 'VIP', description: 'VIP snapshot',
        discountType: 'FIXED', discountValue: '49.00', discountAmount: '49.00' } } } : {}) } })
    return id
  }

  function context(branch = branchId, organization = organizationId): PaymentUseCaseContext {
    const subject: PolicySubject = { userId, organizationId: organization, branchIds: new Set([branch]), permissions }
    return { subject, branchId: branch }
  }
  const payment = (amount: string, method: 'CASH' | 'CARD' | 'QR' = 'CASH') =>
    ({ amount, method, currency: 'THB', idempotencyKey: randomUUID() })

  it('summarizes tax and discount snapshots, records partial/full payment history, closes sale, and prepares receipt', async () => {
    expect(await operations.getCheckoutSummary(context(), bookingId)).toMatchObject({ ok: true, value: {
      subtotalAmount: '735.00', taxAmount: '49.00', discountAmount: '49.00', grandTotal: '700.00',
      paymentStatus: 'PENDING', taxSummary: [{ taxMode: 'INCLUDED' }, { taxMode: 'EXCLUDED' }] } })
    expect(await operations.createPayment(context(), bookingId, payment('300.00')))
      .toMatchObject({ ok: true, value: { checkout: { paymentStatus: 'PARTIAL', remainingAmount: '400.00' } } })
    expect(await operations.createPayment(context(), bookingId, payment('400.00', 'CARD')))
      .toMatchObject({ ok: true, value: { checkout: { paymentStatus: 'PAID', remainingAmount: '0.00' } } })
    expect(await operations.getBookingPayments(context(), bookingId)).toMatchObject({ ok: true,
      value: [{ amount: '300.00' }, { amount: '400.00' }] })
    expect(await operations.closeSale(context(), bookingId)).toMatchObject({ ok: true, value: { paymentStatus: 'PAID' } })
    const receipt = await operations.getReceiptData(context(), bookingId)
    expect(receipt).toMatchObject({ ok: true, value: { cashier: { userId }, checkout: { grandTotal: '700.00' } } })
    if (receipt.ok) expect(receipt.value.receiptReference.startsWith('BKG-')).toBe(true)
  })

  it('creates split payments atomically and exposes tenant-scoped search', async () => {
    expect(await operations.createSplitPayment(context(), bookingId,
      { payments: [payment('200.00', 'QR'), payment('500.00', 'CARD')] }))
      .toMatchObject({ ok: true, value: { payments: [{ method: 'QR' }, { method: 'CARD' }],
        checkout: { paymentStatus: 'PAID' } } })
    expect(await operations.getPaymentList(context(), { branchId, bookingId, status: 'PAID', page: 1,
      pageSize: 20, sort: 'createdAt', order: 'asc' })).toMatchObject({ ok: true, value: { totalItems: 2 } })
  })

  it('voids payment before sale close without deleting financial history', async () => {
    const created = await operations.createPayment(context(), bookingId, payment('300.00')); if (!created.ok) return
    const id = created.value.payments[0]!.id
    expect(await operations.voidPayment(context(), id, { reason: 'Wrong tender' })).toMatchObject({ ok: true,
      value: { payments: [{ status: 'VOID', voidReason: 'Wrong tender' }], checkout: { paymentStatus: 'PENDING' } } })
    expect(await database!.payment.count({ where: { id } })).toBe(1)
  })

  it('stores partial refund history, completes refund, and rejects excessive refunds', async () => {
    const created = await operations.createPayment(context(), bookingId, payment('700.00')); if (!created.ok) return
    const id = created.value.payments[0]!.id
    expect(await operations.refundPayment(context(), id, { amount: '200.00', reason: 'Service adjustment' }))
      .toMatchObject({ ok: true, value: { payments: [{ status: 'PARTIAL', refundedAmount: '200.00' }],
        checkout: { paymentStatus: 'PARTIAL', paidAmount: '500.00' } } })
    expect(await operations.refundPayment(context(), id, { amount: '500.00', reason: 'Full return' }))
      .toMatchObject({ ok: true, value: { payments: [{ status: 'REFUNDED', refundedAmount: '700.00' }],
        checkout: { paymentStatus: 'REFUNDED' } } })
    expect(await operations.refundPayment(context(), id, { amount: '1.00', reason: 'Excess' }))
      .toMatchObject({ ok: false, error: { code: 'CONFLICT' } })
    expect(await database!.paymentRefund.count({ where: { paymentId: id } })).toBe(2)
  })

  it('rejects overpayment, currency mismatch, non-completed checkout, and premature close', async () => {
    expect(await operations.createPayment(context(), bookingId, payment('700.01')))
      .toMatchObject({ ok: false, error: { code: 'CONFLICT' } })
    expect(await operations.createPayment(context(), bookingId, { ...payment('100.00'), currency: 'USD' }))
      .toMatchObject({ ok: false, error: { code: 'BUSINESS_RULE_VIOLATION' } })
    const inProgress = await createBooking('IN_PROGRESS', false)
    expect(await operations.createPayment(context(), inProgress, payment('100.00')))
      .toMatchObject({ ok: false, error: { message: 'Only completed bookings can accept payment' } })
    expect(await operations.closeSale(context(), bookingId))
      .toMatchObject({ ok: false, error: { code: 'BUSINESS_RULE_VIOLATION' } })
  })

  it('prevents concurrent payments from exceeding the remaining amount', async () => {
    const results = await Promise.all([operations.createPayment(context(), bookingId, payment('400.00')),
      operations.createPayment(context(), bookingId, payment('400.00', 'CARD'))])
    expect(results.filter((result) => result.ok)).toHaveLength(1)
    const stored = await database!.payment.aggregate({ where: { bookingId, status: 'PAID' }, _sum: { amount: true } })
    expect(stored._sum.amount?.toFixed(2)).toBe('400.00')
  })

  it('enforces tenant and branch isolation', async () => {
    const created = await operations.createPayment(context(), bookingId, payment('100.00')); if (!created.ok) return
    const id = created.value.payments[0]!.id
    expect(await operations.getPayment(context(siblingBranchId), id)).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } })
    expect(await operations.getPayment(context(otherBranchId, otherOrganizationId), id))
      .toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } })
    expect(await operations.getPaymentList(context(), { branchId: siblingBranchId, page: 1, pageSize: 20,
      sort: 'createdAt', order: 'desc' })).toMatchObject({ ok: false, error: { code: 'TENANT_ISOLATION' } })
  })

  it('rolls back payment creation after a technical transaction failure', async () => {
    const id = randomUUID()
    await expect(transactions.withTransaction(async ({ payments }) => {
      await payments.create({ id, bookingId, receivedByUserId: userId, amount: '100.00', currency: 'THB',
        method: 'CASH', status: 'PAID', externalReference: null, idempotencyKey: null, paidAt: now, notes: null })
      throw new Error('technical rollback')
    })).rejects.toThrow('technical rollback')
    expect(await database!.payment.count({ where: { id } })).toBe(0)
  })
})
