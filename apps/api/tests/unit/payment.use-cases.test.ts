import { describe, expect, it } from 'vitest'
import type { CheckoutFinancialRecord, CreatePaymentData, CreatePaymentRefundData, PaymentListQuery,
  PaymentRecord, PaymentRefundRecord, PaymentRepository, PaymentStatusValue,
  TenantScope } from '../../src/application/foundation/repositories.js'
import { PaymentPolicy, PolicyEngine, type PolicySubject } from '../../src/application/foundation/policy.js'
import type { TransactionManager, TransactionScope } from '../../src/application/foundation/transaction.js'
import { NotFoundError } from '../../src/domain/foundation/domain-errors.js'
import { DomainEventFactory, InProcessDomainEventDispatcher } from '../../src/domain/foundation/domain-events.js'
import { failure, success, type Result } from '../../src/domain/foundation/result.js'
import { FixedClock } from '../../src/infrastructure/foundation/system-adapters.js'
import { PaymentFinancialEngine } from '../../src/modules/pos-payment/payment.engine.js'
import { PaymentOperations, type PaymentDependencies,
  type PaymentUseCaseContext } from '../../src/modules/pos-payment/payment.use-cases.js'

const organizationId = '10000000-0000-4000-8000-000000000001'
const branchId = '20000000-0000-4000-8000-000000000001'
const bookingId = '30000000-0000-4000-8000-000000000001'
const paymentId = '40000000-0000-4000-8000-000000000001'
const now = new Date('2026-08-08T00:00:00.000Z')

function financials(): CheckoutFinancialRecord {
  return { organizationId, organizationName: 'Salon', currency: 'THB', branchId, branchName: 'Main',
    customerId: 'customer', customerName: 'Jane', customerPhone: null, bookingId, bookingNumber: 'BKG-1',
    bookingStatus: 'COMPLETED', paymentStatus: 'PENDING', saleClosedAt: null, closedByUserId: null,
    closedByName: null, items: [{ id: 'item', bookingId, serviceId: 'service', employeeId: 'employee',
      employeeName: 'May', serviceName: 'Cut', status: 'COMPLETED', startsAt: now, endsAt: now,
      durationMinutes: 60, quantity: 1, unitPrice: '107.00', discountAmount: '0.00', subtotalAmount: '100.00',
      taxType: 'VAT', taxMode: 'EXCLUDED', taxRate: '7.00', taxAmount: '7.00', totalAmount: '107.00',
      notes: null, createdAt: now, updatedAt: now }], discounts: [], payments: [] }
}

class MemoryPayments implements PaymentRepository {
  data = financials()
  locks: string[][] = []

  async findById(_scope: TenantScope, id: string) {
    const value = this.data.payments.find((payment) => payment.id === id)
    return value ? success(value) : failure(new NotFoundError('not found'))
  }
  async findPage(_scope: TenantScope, query: PaymentListQuery) {
    return { items: this.data.payments, page: query.page, pageSize: query.pageSize,
      totalItems: this.data.payments.length, totalPages: this.data.payments.length ? 1 : 0 }
  }
  async findBookingFinancials(_scope: TenantScope, id: string) { return id === bookingId ? this.data : null }
  async findByIdempotencyKey(_scope: TenantScope, key: string) {
    return this.data.payments.find((payment) => payment.idempotencyKey === key) ?? null
  }
  async acquireFinancialLocks(_scope: TenantScope, keys: readonly string[]) { this.locks.push([...keys]) }
  async create(input: CreatePaymentData) {
    const value: PaymentRecord = { ...input, branchId, bookingNumber: 'BKG-1', customerId: 'customer',
      customerName: 'Jane', customerPhone: null, cashierName: 'Cashier', refundedAt: null, voidedAt: null,
      voidReason: null, refunds: [], refundedAmount: '0.00', netAmount: input.amount,
      createdAt: now, updatedAt: now }
    this.data = { ...this.data, payments: [...this.data.payments, value] }; return value
  }
  async createMany(input: readonly CreatePaymentData[]) {
    const values: PaymentRecord[] = []; for (const item of input) values.push(await this.create(item)); return values
  }
  async void(_scope: TenantScope, id: string, voidedAt: Date, reason: string) {
    const current = this.data.payments.find((payment) => payment.id === id); if (!current) return null
    const value = { ...current, status: 'VOID' as const, voidedAt, voidReason: reason, netAmount: '0.00' }
    this.replace(value); return value
  }
  async createRefund(_scope: TenantScope, input: CreatePaymentRefundData): Promise<PaymentRefundRecord | null> {
    const current = this.data.payments.find((payment) => payment.id === input.paymentId); if (!current) return null
    const refund: PaymentRefundRecord = { ...input, cashierName: 'Cashier', createdAt: now, updatedAt: now }
    const refundedAmount = (Number(current.refundedAmount) + Number(input.amount)).toFixed(2)
    this.replace({ ...current, refunds: [...current.refunds, refund], refundedAmount,
      netAmount: (Number(current.amount) - Number(refundedAmount)).toFixed(2) })
    return refund
  }
  async updateRefundStatus(_scope: TenantScope, id: string, status: 'PARTIAL' | 'REFUNDED', refundedAt: Date) {
    const current = this.data.payments.find((payment) => payment.id === id); if (!current) return null
    const value = { ...current, status, refundedAt }; this.replace(value); return value
  }
  async updateBookingPaymentStatus(_scope: TenantScope, id: string, status: PaymentStatusValue) {
    if (id !== bookingId) return false; this.data = { ...this.data, paymentStatus: status }; return true
  }
  async closeSale(_scope: TenantScope, id: string, closedAt: Date, closedByUserId: string) {
    if (id !== bookingId || this.data.saleClosedAt) return false
    this.data = { ...this.data, saleClosedAt: closedAt, closedByUserId, closedByName: 'Cashier' }; return true
  }
  private replace(value: PaymentRecord) {
    this.data = { ...this.data, payments: this.data.payments.map((payment) => payment.id === value.id ? value : payment) }
  }
}

class Transactions implements TransactionManager {
  calls = 0
  constructor(private readonly payments: PaymentRepository) {}
  async withTransaction<T, E>(work: (scope: TransactionScope) => Promise<Result<T, E>>) {
    this.calls += 1; return work({ payments: this.payments } as TransactionScope)
  }
}

function harness(permissionValues?: string[]) {
  const repository = new MemoryPayments(); const transactions = new Transactions(repository)
  const permissions = permissionValues ?? ['payment.create', 'payment.read', 'payment.void', 'payment.refund',
    'payment.checkout', 'payment.close_sale', 'pos.read', 'pos.manage']
  const subject: PolicySubject = { userId: 'user', organizationId, branchIds: new Set([branchId]),
    permissions: new Set(permissions) }; const context: PaymentUseCaseContext = { subject, branchId }
  let sequence = 0; const clock = new FixedClock(now)
  const dependencies: PaymentDependencies = { repository, transactions, policyEngine: new PolicyEngine(),
    policy: new PaymentPolicy(), eventFactory: new DomainEventFactory(clock, { generate: () => `event-${++sequence}` }),
    events: new InProcessDomainEventDispatcher(), clock, ids: { generate: () => sequence++ ? `id-${sequence}` : paymentId },
    financials: new PaymentFinancialEngine() }
  return { operations: new PaymentOperations(dependencies), repository, transactions, context }
}
const cash = (amount: string) => ({ method: 'CASH' as const, amount, currency: 'THB' })

describe('Payment use cases', () => {
  it('creates partial then full payments and recalculates booking status in transactions', async () => {
    const test = harness()
    expect(await test.operations.createPayment(test.context, bookingId, cash('40.00')))
      .toMatchObject({ ok: true, value: { checkout: { paymentStatus: 'PARTIAL', remainingAmount: '67.00' } } })
    expect(await test.operations.createPayment(test.context, bookingId, cash('67.00')))
      .toMatchObject({ ok: true, value: { checkout: { paymentStatus: 'PAID', remainingAmount: '0.00' } } })
    expect(test.transactions.calls).toBe(2); expect(test.repository.locks).toHaveLength(2)
  })

  it('creates an atomic split payment and denies overpayment', async () => {
    const test = harness()
    expect(await test.operations.createSplitPayment(test.context, bookingId,
      { payments: [cash('50.00'), { ...cash('57.00'), method: 'CARD' }] }))
      .toMatchObject({ ok: true, value: { payments: [{ amount: '50.00' }, { amount: '57.00' }],
        checkout: { paymentStatus: 'PAID' } } })
    const denied = harness()
    expect(await denied.operations.createPayment(denied.context, bookingId, cash('107.01')))
      .toMatchObject({ ok: false, error: { code: 'CONFLICT' } })
  })

  it('voids an unpaid sale payment without deleting history', async () => {
    const test = harness(); const created = await test.operations.createPayment(test.context, bookingId, cash('40.00'))
    if (!created.ok) return; const id = created.value.payments[0]!.id
    expect(await test.operations.voidPayment(test.context, id, { reason: 'Tender error' }))
      .toMatchObject({ ok: true, value: { payments: [{ status: 'VOID', voidReason: 'Tender error' }],
        checkout: { paymentStatus: 'PENDING', paidAmount: '0.00' } } })
    expect(test.repository.data.payments).toHaveLength(1)
  })

  it('supports partial and full refund while rejecting excessive refund', async () => {
    const test = harness(); const created = await test.operations.createPayment(test.context, bookingId, cash('107.00'))
    if (!created.ok) return; const id = created.value.payments[0]!.id
    expect(await test.operations.refundPayment(test.context, id, { amount: '40.00', reason: 'Adjustment' }))
      .toMatchObject({ ok: true, value: { payments: [{ status: 'PARTIAL', refundedAmount: '40.00' }],
        checkout: { paymentStatus: 'PARTIAL', paidAmount: '67.00' } } })
    expect(await test.operations.refundPayment(test.context, id, { amount: '67.00', reason: 'Return' }))
      .toMatchObject({ ok: true, value: { payments: [{ status: 'REFUNDED', refundedAmount: '107.00' }],
        checkout: { paymentStatus: 'REFUNDED' } } })
    expect(await test.operations.refundPayment(test.context, id, { amount: '1.00', reason: 'Again' }))
      .toMatchObject({ ok: false, error: { code: 'CONFLICT' } })
  })

  it('closes a fully paid completed sale and prepares snapshot receipt data', async () => {
    const test = harness(); await test.operations.createPayment(test.context, bookingId, cash('107.00'))
    expect(await test.operations.closeSale(test.context, bookingId))
      .toMatchObject({ ok: true, value: { saleClosedAt: now, paymentStatus: 'PAID' } })
    expect(await test.operations.getReceiptData(test.context, bookingId))
      .toMatchObject({ ok: true, value: { receiptReference: 'BKG-1', cashier: { userId: 'user' },
        checkout: { grandTotal: '107.00' } } })
  })

  it('enforces policy and branch isolation before repository writes', async () => {
    const denied = harness([])
    expect(await denied.operations.createPayment(denied.context, bookingId, cash('10.00')))
      .toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } })
    expect(denied.transactions.calls).toBe(0)
    const test = harness()
    expect(await test.operations.getPaymentList(test.context, { branchId: 'other', page: 1, pageSize: 20,
      sort: 'createdAt', order: 'desc' })).toMatchObject({ ok: false, error: { code: 'TENANT_ISOLATION' } })
  })
})
