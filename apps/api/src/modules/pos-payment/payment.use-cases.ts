import type { CreatePaymentData, PaymentListQuery, PaymentRecord,
  PaymentRepository, TenantScope } from '../../application/foundation/repositories.js'
import type { PageResult } from '../../application/foundation/query.js'
import type { PaymentPolicy, PolicyEngine, PolicySubject } from '../../application/foundation/policy.js'
import type { TransactionManager } from '../../application/foundation/transaction.js'
import { BookingNotPayableError, CheckoutMismatchError, ConflictError, FinancialIntegrityError,
  PaymentAlreadyRefundedError, PaymentAlreadyVoidedError, PaymentExceedsRemainingAmountError,
  PaymentNotFoundError, RefundAmountInvalidError, TenantIsolationError,
  type DomainError } from '../../domain/foundation/domain-errors.js'
import type { DomainEventFactory, DomainEventPublisher } from '../../domain/foundation/domain-events.js'
import type { IdGenerator } from '../../domain/foundation/id-generator.js'
import { failure, success, type Result } from '../../domain/foundation/result.js'
import type { Clock } from '../../domain/foundation/time.js'
import { cents, money, type CheckoutSummary, type PaymentFinancialEngine } from './payment.engine.js'
import { PaymentEventName } from './payment.events.js'
import type { CreatePaymentRequest, CreateSplitPaymentRequest, PaymentListRequest,
  RefundPaymentRequest, VoidPaymentRequest } from './payment.schemas.js'

export interface PaymentUseCaseContext { subject: PolicySubject; branchId: string }
export interface PaymentDependencies {
  repository: PaymentRepository
  transactions: TransactionManager
  policyEngine: PolicyEngine
  policy: PaymentPolicy
  eventFactory: DomainEventFactory
  events: DomainEventPublisher
  clock: Clock
  ids: IdGenerator
  financials: PaymentFinancialEngine
}
export interface PaymentMutationResult { payments: readonly PaymentRecord[]; checkout: CheckoutSummary }
export interface ReceiptData { receiptReference: string; issuedAt: Date; paidAt: Date | null;
  cashier: { userId: string | null; name: string | null }; checkout: CheckoutSummary }

export class PaymentOperations {
  constructor(private readonly dependencies: PaymentDependencies) {}

  async getCheckoutSummary(context: PaymentUseCaseContext, bookingId: string) {
    const allowed = this.authorize(context, 'pos.read'); if (!allowed.ok) return allowed
    const data = await this.dependencies.repository.findBookingFinancials(this.scope(context), bookingId)
    return data ? this.dependencies.financials.summarize(data)
      : failure(new PaymentNotFoundError('Booking checkout was not found'))
  }

  async validateCheckout(context: PaymentUseCaseContext, bookingId: string) {
    const allowed = this.authorize(context, 'payment.checkout'); if (!allowed.ok) return allowed
    const data = await this.dependencies.repository.findBookingFinancials(this.scope(context), bookingId)
    if (!data) return failure(new PaymentNotFoundError('Booking checkout was not found'))
    const summary = this.dependencies.financials.validatePayable(data); if (!summary.ok) return summary
    if (data.paymentStatus !== summary.value.paymentStatus) {
      return failure(new CheckoutMismatchError('Stored payment status does not match financial history'))
    }
    return this.publish(success(summary.value), [PaymentEventName.CHECKOUT_VALIDATED], bookingId, {})
  }

  async closeSale(context: PaymentUseCaseContext, bookingId: string) {
    const allowed = this.authorize(context, 'payment.close_sale'); if (!allowed.ok) return allowed
    const result = await this.dependencies.transactions.withTransaction<CheckoutSummary, DomainError>(async ({ payments }) => {
      await payments.acquireFinancialLocks(this.scope(context), [`booking:${bookingId}`])
      const data = await payments.findBookingFinancials(this.scope(context), bookingId)
      if (!data) return failure(new PaymentNotFoundError('Booking checkout was not found'))
      if (data.saleClosedAt) return failure(new ConflictError('Sale is already closed'))
      const summary = this.dependencies.financials.validatePayable(data); if (!summary.ok) return summary
      if (summary.value.paymentStatus !== 'PAID' || cents(summary.value.remainingAmount) !== 0n) {
        return failure(new BookingNotPayableError('Sale can close only after full payment'))
      }
      if (data.paymentStatus !== 'PAID' && !await payments.updateBookingPaymentStatus(this.scope(context), bookingId, 'PAID')) {
        return failure(new FinancialIntegrityError('Booking payment status could not be updated'))
      }
      if (!await payments.closeSale(this.scope(context), bookingId, this.dependencies.clock.utc(), context.subject.userId)) {
        return failure(new ConflictError('Sale close conflicted with another operation'))
      }
      const closed = await payments.findBookingFinancials(this.scope(context), bookingId)
      if (!closed) return failure(new PaymentNotFoundError('Closed sale was not found'))
      return this.dependencies.financials.summarize(closed)
    })
    return this.publish(result, [PaymentEventName.SALE_CLOSED], bookingId, {})
  }

  async createPayment(context: PaymentUseCaseContext, bookingId: string, input: CreatePaymentRequest) {
    const allowed = this.authorize(context, 'payment.create'); if (!allowed.ok) return allowed
    const amount = this.dependencies.financials.parseAmount(input.amount); if (!amount.ok) return amount
    const result = await this.dependencies.transactions.withTransaction<PaymentMutationResult, DomainError>(async ({ payments }) => {
      await payments.acquireFinancialLocks(this.scope(context), [`booking:${bookingId}`])
      const data = await payments.findBookingFinancials(this.scope(context), bookingId)
      if (!data) return failure(new PaymentNotFoundError('Booking checkout was not found'))
      const summary = this.dependencies.financials.validatePayable(data); if (!summary.ok) return summary
      if (data.saleClosedAt) return failure(new BookingNotPayableError('Closed sale cannot accept another payment'))
      if (input.currency !== data.currency) return failure(new FinancialIntegrityError('Payment currency does not match organization currency'))
      const storedKey = input.idempotencyKey ? idempotencyKey(bookingId, input.idempotencyKey) : null
      if (storedKey) {
        const existing = await payments.findByIdempotencyKey(this.scope(context), storedKey)
        if (existing) return existing.bookingId === bookingId && existing.amount === money(amount.value)
          && existing.method === input.method ? success({ payments: [existing], checkout: summary.value })
          : failure(new CheckoutMismatchError('Idempotency key was used with different payment data'))
      }
      if (amount.value > cents(summary.value.remainingAmount)) {
        return failure(new PaymentExceedsRemainingAmountError('Payment exceeds remaining amount'))
      }
      const payment = await payments.create(this.paymentData(context, bookingId, input, storedKey))
      const checkout = await this.mustRecalculate(payments, context, bookingId)
      return success({ payments: [payment], checkout })
    })
    const events = result.ok && result.value.checkout.paymentStatus !== 'PENDING'
      ? [PaymentEventName.PAYMENT_CREATED, PaymentEventName.BOOKING_STATUS_CHANGED] : [PaymentEventName.PAYMENT_CREATED]
    return this.publish(result, events, bookingId, { paymentId: result.ok ? result.value.payments[0]?.id : undefined })
  }

  async createSplitPayment(context: PaymentUseCaseContext, bookingId: string, input: CreateSplitPaymentRequest) {
    const allowed = this.authorize(context, 'payment.create'); if (!allowed.ok) return allowed
    const parsed = input.payments.map((payment) => this.dependencies.financials.parseAmount(payment.amount))
    const invalid = parsed.find((amount) => !amount.ok); if (invalid && !invalid.ok) return invalid
    const total = parsed.reduce((sum, amount) => sum + (amount.ok ? amount.value : 0n), 0n)
    const result = await this.dependencies.transactions.withTransaction<PaymentMutationResult, DomainError>(async ({ payments }) => {
      await payments.acquireFinancialLocks(this.scope(context), [`booking:${bookingId}`])
      const data = await payments.findBookingFinancials(this.scope(context), bookingId)
      if (!data) return failure(new PaymentNotFoundError('Booking checkout was not found'))
      const summary = this.dependencies.financials.validatePayable(data); if (!summary.ok) return summary
      if (data.saleClosedAt) return failure(new BookingNotPayableError('Closed sale cannot accept another payment'))
      if (input.payments.some((payment) => payment.currency !== data.currency)) {
        return failure(new FinancialIntegrityError('Payment currency does not match organization currency'))
      }
      if (total > cents(summary.value.remainingAmount)) {
        return failure(new PaymentExceedsRemainingAmountError('Split payments exceed remaining amount'))
      }
      const keys = input.payments.map((payment) => payment.idempotencyKey
        ? idempotencyKey(bookingId, payment.idempotencyKey) : null)
      if (new Set(keys.filter(Boolean)).size !== keys.filter(Boolean).length) {
        return failure(new CheckoutMismatchError('Split payment idempotency keys must be unique'))
      }
      for (const key of keys) if (key && await payments.findByIdempotencyKey(this.scope(context), key)) {
        return failure(new CheckoutMismatchError('Split payment idempotency key was already used'))
      }
      const created = await payments.createMany(input.payments.map((payment, index) =>
        this.paymentData(context, bookingId, payment, keys[index] ?? null)))
      const checkout = await this.mustRecalculate(payments, context, bookingId)
      return success({ payments: created, checkout })
    })
    return this.publish(result, [PaymentEventName.SPLIT_PAYMENT_CREATED, PaymentEventName.BOOKING_STATUS_CHANGED],
      bookingId, { paymentIds: result.ok ? result.value.payments.map(({ id }) => id) : [] })
  }

  async getPayment(context: PaymentUseCaseContext, paymentId: string) {
    const allowed = this.authorize(context, 'payment.read'); if (!allowed.ok) return allowed
    const payment = await this.dependencies.repository.findById(this.scope(context), paymentId)
    return payment.ok ? payment : failure(new PaymentNotFoundError('Payment was not found'))
  }

  async getBookingPayments(context: PaymentUseCaseContext, bookingId: string) {
    const allowed = this.authorize(context, 'payment.read'); if (!allowed.ok) return allowed
    const value = await this.dependencies.repository.findBookingFinancials(this.scope(context), bookingId)
    return value ? success(value.payments) : failure(new PaymentNotFoundError('Booking was not found'))
  }

  async getPaymentList(context: PaymentUseCaseContext, query: PaymentListQuery): Promise<Result<PageResult<PaymentRecord>, DomainError>> {
    if (query.branchId !== context.branchId) return failure(new TenantIsolationError('Branch filter must match branch context'))
    const allowed = this.authorize(context, 'payment.read'); return allowed.ok
      ? success(await this.dependencies.repository.findPage(this.scope(context), query)) : allowed
  }

  async voidPayment(context: PaymentUseCaseContext, paymentId: string, input: VoidPaymentRequest) {
    const allowed = this.authorize(context, 'payment.void'); if (!allowed.ok) return allowed
    const result = await this.dependencies.transactions.withTransaction<PaymentMutationResult, DomainError>(async ({ payments }) => {
      const first = await payments.findById(this.scope(context), paymentId)
      if (!first.ok) return failure(new PaymentNotFoundError('Payment was not found'))
      await payments.acquireFinancialLocks(this.scope(context), [`booking:${first.value.bookingId}`, `payment:${paymentId}`])
      const current = await payments.findById(this.scope(context), paymentId)
      if (!current.ok) return failure(new PaymentNotFoundError('Payment was not found'))
      if (current.value.status === 'VOID') return failure(new PaymentAlreadyVoidedError('Payment is already voided'))
      if (current.value.refunds.length || current.value.status === 'PARTIAL' || current.value.status === 'REFUNDED') {
        return failure(new PaymentAlreadyRefundedError('Refunded payment cannot be voided'))
      }
      const data = await payments.findBookingFinancials(this.scope(context), current.value.bookingId)
      if (!data) return failure(new PaymentNotFoundError('Booking was not found'))
      if (data.saleClosedAt) return failure(new ConflictError('Payment cannot be voided after sale close'))
      const payment = await payments.void(this.scope(context), paymentId, this.dependencies.clock.utc(), input.reason)
      if (!payment) return failure(new ConflictError('Payment void conflicted with another operation'))
      const checkout = await this.mustRecalculate(payments, context, payment.bookingId)
      return success({ payments: [payment], checkout })
    })
    return this.publish(result, [PaymentEventName.PAYMENT_VOIDED, PaymentEventName.BOOKING_STATUS_CHANGED],
      result.ok ? result.value.payments[0]!.bookingId : '', { paymentId })
  }

  async refundPayment(context: PaymentUseCaseContext, paymentId: string, input: RefundPaymentRequest) {
    const allowed = this.authorize(context, 'payment.refund'); if (!allowed.ok) return allowed
    const amount = this.dependencies.financials.parseAmount(input.amount); if (!amount.ok) {
      return failure(new RefundAmountInvalidError(amount.error.message))
    }
    const result = await this.dependencies.transactions.withTransaction<PaymentMutationResult, DomainError>(async ({ payments }) => {
      const first = await payments.findById(this.scope(context), paymentId)
      if (!first.ok) return failure(new PaymentNotFoundError('Payment was not found'))
      await payments.acquireFinancialLocks(this.scope(context), [`booking:${first.value.bookingId}`, `payment:${paymentId}`])
      const current = await payments.findById(this.scope(context), paymentId)
      if (!current.ok) return failure(new PaymentNotFoundError('Payment was not found'))
      if (current.value.status === 'VOID') return failure(new PaymentAlreadyVoidedError('Voided payment cannot be refunded'))
      if (current.value.status === 'REFUNDED') return failure(new PaymentAlreadyRefundedError('Payment is already fully refunded'))
      const refundable = cents(current.value.netAmount)
      if (amount.value > refundable) return failure(new RefundAmountInvalidError('Refund exceeds refundable amount'))
      const refund = await payments.createRefund(this.scope(context), { id: this.dependencies.ids.generate(), paymentId,
        refundedByUserId: context.subject.userId, amount: money(amount.value), currency: current.value.currency,
        reason: input.reason, externalReference: input.externalReference ?? null, notes: input.notes ?? null })
      if (!refund) return failure(new PaymentNotFoundError('Payment was not found'))
      const status = amount.value === refundable ? 'REFUNDED' : 'PARTIAL'
      const payment = await payments.updateRefundStatus(this.scope(context), paymentId, status, this.dependencies.clock.utc())
      if (!payment) throw new Error('Payment refund state could not be reconciled after refund creation')
      const checkout = await this.mustRecalculate(payments, context, payment.bookingId)
      return success({ payments: [payment], checkout })
    })
    return this.publish(result, [PaymentEventName.PAYMENT_REFUNDED, PaymentEventName.BOOKING_STATUS_CHANGED],
      result.ok ? result.value.payments[0]!.bookingId : '', { paymentId, amount: input.amount })
  }

  async getReceiptData(context: PaymentUseCaseContext, bookingId: string): Promise<Result<ReceiptData, DomainError>> {
    const allowed = this.authorize(context, 'pos.read'); if (!allowed.ok) return allowed
    const data = await this.dependencies.repository.findBookingFinancials(this.scope(context), bookingId)
    if (!data) return failure(new PaymentNotFoundError('Booking was not found'))
    if (!data.saleClosedAt) return failure(new BookingNotPayableError('Receipt is available only after sale close'))
    const checkout = this.dependencies.financials.summarize(data); if (!checkout.ok) return checkout
    const paidAt = data.payments.map(({ paidAt }) => paidAt).filter((value): value is Date => value !== null)
      .sort((left, right) => right.getTime() - left.getTime())[0] ?? null
    const receipt = { receiptReference: data.bookingNumber, issuedAt: data.saleClosedAt, paidAt,
      cashier: { userId: data.closedByUserId, name: data.closedByName }, checkout: checkout.value }
    return this.publish(success(receipt), [PaymentEventName.RECEIPT_GENERATED], bookingId, {})
  }

  async recalculateBookingPaymentStatus(context: PaymentUseCaseContext, bookingId: string) {
    const allowed = this.authorize(context, 'pos.manage'); if (!allowed.ok) return allowed
    const result = await this.dependencies.transactions.withTransaction<CheckoutSummary, DomainError>(async ({ payments }) => {
      await payments.acquireFinancialLocks(this.scope(context), [`booking:${bookingId}`])
      return this.recalculate(payments, context, bookingId)
    })
    return this.publish(result, [PaymentEventName.BOOKING_STATUS_CHANGED], bookingId,
      { paymentStatus: result.ok ? result.value.paymentStatus : undefined })
  }

  private async recalculate(repository: PaymentRepository, context: PaymentUseCaseContext, bookingId: string) {
    const data = await repository.findBookingFinancials(this.scope(context), bookingId)
    if (!data) return failure(new PaymentNotFoundError('Booking was not found'))
    const summary = this.dependencies.financials.summarize(data); if (!summary.ok) return summary
    if (data.paymentStatus !== summary.value.paymentStatus
      && !await repository.updateBookingPaymentStatus(this.scope(context), bookingId, summary.value.paymentStatus)) {
      return failure(new FinancialIntegrityError('Booking payment status could not be updated'))
    }
    return success(summary.value)
  }

  private async mustRecalculate(repository: PaymentRepository, context: PaymentUseCaseContext, bookingId: string) {
    const result = await this.recalculate(repository, context, bookingId)
    if (!result.ok) throw new Error('Financial state could not be reconciled after payment write')
    return result.value
  }

  private paymentData(context: PaymentUseCaseContext, bookingId: string, input: CreatePaymentRequest,
    storedKey: string | null): CreatePaymentData {
    return { id: this.dependencies.ids.generate(), bookingId, receivedByUserId: context.subject.userId,
      amount: input.amount, currency: input.currency, method: input.method, status: 'PAID',
      externalReference: input.externalReference ?? null, idempotencyKey: storedKey,
      paidAt: this.dependencies.clock.utc(), notes: input.notes ?? null }
  }

  private scope(context: PaymentUseCaseContext): TenantScope {
    return { organizationId: context.subject.organizationId, branchId: context.branchId }
  }
  private authorize(context: PaymentUseCaseContext, permission: string) {
    return this.dependencies.policyEngine.authorize(this.dependencies.policy, context.subject, { permission },
      { organizationId: context.subject.organizationId, branchId: context.branchId, ownerId: null })
  }
  private async publish<T>(result: Result<T, DomainError>, names: readonly string[], bookingId: string,
    payload: Readonly<Record<string, unknown>>): Promise<Result<T, DomainError>> {
    if (!result.ok) return result
    const published = await this.dependencies.events.publish(names.map((name) => this.dependencies.eventFactory.create({
      name, aggregateId: bookingId, payload: { bookingId, ...payload } })))
    return published.ok ? result : published
  }
}

function idempotencyKey(bookingId: string, key: string) { return `${bookingId}:${key}` }

export function toPaymentListQuery(input: PaymentListRequest, branchId: string): PaymentListQuery {
  return { branchId: input.branchId ?? branchId, page: input.page, pageSize: input.pageSize,
    sort: input.sort, order: input.order, ...(input.keyword ? { keyword: input.keyword } : {}),
    ...(input.bookingId ? { bookingId: input.bookingId } : {}), ...(input.customerId ? { customerId: input.customerId } : {}),
    ...(input.method ? { method: input.method } : {}), ...(input.status ? { status: input.status } : {}),
    ...(input.dateFrom ? { dateFrom: new Date(input.dateFrom) } : {}),
    ...(input.dateTo ? { dateTo: new Date(input.dateTo) } : {}) }
}

export class GetCheckoutSummary { constructor(private readonly o: PaymentOperations) {} execute(c: PaymentUseCaseContext, id: string) { return this.o.getCheckoutSummary(c, id) } }
export class ValidateCheckout { constructor(private readonly o: PaymentOperations) {} execute(c: PaymentUseCaseContext, id: string) { return this.o.validateCheckout(c, id) } }
export class CloseSale { constructor(private readonly o: PaymentOperations) {} execute(c: PaymentUseCaseContext, id: string) { return this.o.closeSale(c, id) } }
export class CreatePayment { constructor(private readonly o: PaymentOperations) {} execute(c: PaymentUseCaseContext, id: string, i: CreatePaymentRequest) { return this.o.createPayment(c, id, i) } }
export class CreateSplitPayment { constructor(private readonly o: PaymentOperations) {} execute(c: PaymentUseCaseContext, id: string, i: CreateSplitPaymentRequest) { return this.o.createSplitPayment(c, id, i) } }
export class GetPayment { constructor(private readonly o: PaymentOperations) {} execute(c: PaymentUseCaseContext, id: string) { return this.o.getPayment(c, id) } }
export class GetBookingPayments { constructor(private readonly o: PaymentOperations) {} execute(c: PaymentUseCaseContext, id: string) { return this.o.getBookingPayments(c, id) } }
export class GetPaymentList { constructor(private readonly o: PaymentOperations) {} execute(c: PaymentUseCaseContext, q: PaymentListQuery) { return this.o.getPaymentList(c, q) } }
export class VoidPayment { constructor(private readonly o: PaymentOperations) {} execute(c: PaymentUseCaseContext, id: string, i: VoidPaymentRequest) { return this.o.voidPayment(c, id, i) } }
export class RefundPayment { constructor(private readonly o: PaymentOperations) {} execute(c: PaymentUseCaseContext, id: string, i: RefundPaymentRequest) { return this.o.refundPayment(c, id, i) } }
export class GetReceiptData { constructor(private readonly o: PaymentOperations) {} execute(c: PaymentUseCaseContext, id: string) { return this.o.getReceiptData(c, id) } }
export class RecalculateBookingPaymentStatus { constructor(private readonly o: PaymentOperations) {} execute(c: PaymentUseCaseContext, id: string) { return this.o.recalculateBookingPaymentStatus(c, id) } }
