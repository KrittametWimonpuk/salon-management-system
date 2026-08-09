import type {
  CheckoutFinancialRecord, CommissionAdjustmentRecord, CommissionHistoryRecord, CommissionListQuery,
  CommissionRepository, CommissionRuleRecord, PaymentRepository, RepositorySet, TenantScope,
} from '../../application/foundation/repositories.js'
import type { CommissionPolicy, PolicyEngine, PolicySubject } from '../../application/foundation/policy.js'
import type { TransactionManager } from '../../application/foundation/transaction.js'
import { BusinessRuleViolationError, CommissionAdjustmentInvalidError, CommissionAlreadyCalculatedError,
  CommissionApprovalInvalidError, CommissionCalculationNotAllowedError, CommissionPeriodLockedError,
  CommissionRuleNotFoundError, NotFoundError, TenantIsolationError, type DomainError,
} from '../../domain/foundation/domain-errors.js'
import type { DomainEventFactory, DomainEventPublisher } from '../../domain/foundation/domain-events.js'
import type { IdGenerator } from '../../domain/foundation/id-generator.js'
import { failure, success, type Result } from '../../domain/foundation/result.js'
import type { Clock } from '../../domain/foundation/time.js'
import type { PaymentFinancialEngine } from '../pos-payment/payment.engine.js'
import type { CommissionFinancialEngine } from './commission.engine.js'
import { cents, money } from './commission.engine.js'
import { CommissionEventName } from './commission.events.js'
import type { CommissionListRequest, CommissionPeriodRequest } from './commission.schemas.js'

export interface CommissionUseCaseContext { subject: PolicySubject; branchId: string }
export interface CommissionDependencies {
  repository: CommissionRepository
  payments: PaymentRepository
  transactions: TransactionManager
  policyEngine: PolicyEngine
  policy: CommissionPolicy
  eventFactory: DomainEventFactory
  events: DomainEventPublisher
  clock: Clock
  ids: IdGenerator
  engine: CommissionFinancialEngine
  paymentFinancials: PaymentFinancialEngine
}

export interface CommissionPreviewLine {
  bookingId: string
  bookingItemId: string
  employeeId: string
  serviceId: string
  serviceName: string
  commissionRuleId: string
  ruleName: string
  type: CommissionRuleRecord['type']
  basis: CommissionRuleRecord['basis']
  baseAmount: string
  percentageRate: string | null
  fixedAmount: string | null
  commissionAmount: string
}
export interface BookingCommissionPreview {
  bookingId: string
  bookingNumber: string
  branchId: string
  saleClosedAt: Date
  period: { dateFrom: Date; dateTo: Date }
  netPaidAmount: string
  items: readonly CommissionPreviewLine[]
  totalCommissionAmount: string
}

export class CommissionOperations {
  constructor(private readonly dependencies: CommissionDependencies) {}

  async previewBooking(context: CommissionUseCaseContext, bookingId: string, input: CommissionPeriodRequest = {}) {
    const allowed = this.authorize(context, 'commission.preview'); if (!allowed.ok) return allowed
    const result = await this.previewWith(this.dependencies.repository, this.dependencies.payments, context, bookingId, input)
    return this.publish(result, CommissionEventName.PREVIEWED, bookingId, {})
  }

  async previewEmployee(context: CommissionUseCaseContext, employeeId: string, input: CommissionPeriodRequest) {
    const allowed = this.authorize(context, 'commission.preview'); if (!allowed.ok) return allowed
    const range = requiredRange(input); if (!range.ok) return range
    const bookingIds = await this.dependencies.repository.findEligibleBookingIds(this.scope(context), range.value.dateFrom,
      range.value.dateTo, employeeId)
    const previews = await this.previewMany(this.repositories(), context, bookingIds, range.value)
    if (!previews.ok) return previews
    const value = previews.value.map((preview) => ({ ...preview,
      items: preview.items.filter((item) => item.employeeId === employeeId) }))
    return this.publish(success(periodPreview(range.value, value)), CommissionEventName.PREVIEWED, employeeId, { employeeId })
  }

  async previewPeriod(context: CommissionUseCaseContext, input: CommissionPeriodRequest) {
    const allowed = this.authorize(context, 'commission.preview'); if (!allowed.ok) return allowed
    const range = requiredRange(input); if (!range.ok) return range
    const bookingIds = await this.dependencies.repository.findEligibleBookingIds(this.scope(context), range.value.dateFrom,
      range.value.dateTo)
    const previews = await this.previewMany(this.repositories(), context, bookingIds, range.value)
    return previews.ok ? this.publish(success(periodPreview(range.value, previews.value)),
      CommissionEventName.PREVIEWED, context.branchId, {}) : previews
  }

  async calculateBooking(context: CommissionUseCaseContext, bookingId: string, input: CommissionPeriodRequest = {}) {
    const allowed = this.authorize(context, 'commission.calculate'); if (!allowed.ok) return allowed
    const result = await this.dependencies.transactions.withTransaction<readonly CommissionHistoryRecord[], DomainError>(
      async (repositories) => {
        await repositories.commissions.acquireLocks(this.scope(context), [`booking:${bookingId}`])
        const preview = await this.previewWith(repositories.commissions, repositories.payments, context, bookingId, input)
        if (!preview.ok) return preview
        return this.persistPreview(repositories.commissions, context, preview.value)
      })
    return this.publishCalculation(result, CommissionEventName.BOOKING_CALCULATED, bookingId)
  }

  async calculateEmployee(context: CommissionUseCaseContext, employeeId: string, input: CommissionPeriodRequest) {
    const allowed = this.authorize(context, 'commission.calculate'); if (!allowed.ok) return allowed
    const range = requiredRange(input); if (!range.ok) return range
    const result = await this.calculateRange(context, range.value, employeeId)
    return this.publishCalculation(result, CommissionEventName.EMPLOYEE_CALCULATED, employeeId)
  }

  async calculatePeriod(context: CommissionUseCaseContext, input: CommissionPeriodRequest) {
    const allowed = this.authorize(context, 'commission.calculate'); if (!allowed.ok) return allowed
    const range = requiredRange(input); if (!range.ok) return range
    const result = await this.calculateRange(context, range.value)
    return this.publishCalculation(result, CommissionEventName.PERIOD_CALCULATED, context.branchId)
  }

  async get(context: CommissionUseCaseContext, id: string) {
    const allowed = this.authorize(context, 'commission.read'); if (!allowed.ok) return allowed
    return this.dependencies.repository.findById(this.scope(context), id)
  }
  async getBookingHistory(context: CommissionUseCaseContext, bookingId: string) {
    const allowed = this.authorize(context, 'commission.read'); return allowed.ok
      ? success(await this.dependencies.repository.findByBooking(this.scope(context), bookingId)) : allowed
  }
  async getEmployeeHistory(context: CommissionUseCaseContext, employeeId: string, input: CommissionPeriodRequest = {}) {
    const allowed = this.authorize(context, 'commission.read'); if (!allowed.ok) return allowed
    const range = optionalRange(input); if (!range.ok) return range
    return success(await this.dependencies.repository.findByEmployee(this.scope(context), employeeId,
      range.value?.dateFrom, range.value?.dateTo))
  }
  async getList(context: CommissionUseCaseContext, query: CommissionListQuery) {
    if (query.branchId !== context.branchId) return failure(new TenantIsolationError('Branch filter must match branch context'))
    const allowed = this.authorize(context, 'commission.read'); return allowed.ok
      ? success(await this.dependencies.repository.findPage(this.scope(context), query)) : allowed
  }

  async recalculateBooking(context: CommissionUseCaseContext, bookingId: string, input: CommissionPeriodRequest & { reason: string }) {
    const allowed = this.authorize(context, 'commission.recalculate'); if (!allowed.ok) return allowed
    const result = await this.dependencies.transactions.withTransaction<readonly CommissionAdjustmentRecord[], DomainError>(
      async (repositories) => {
        await repositories.commissions.acquireLocks(this.scope(context), [`booking:${bookingId}`])
        const histories = await repositories.commissions.findByBooking(this.scope(context), bookingId)
        if (!histories.length) return failure(new NotFoundError('Booking commission history was not found'))
        if (histories.some(({ approvals }) => approvals.length > 0)) {
          return failure(new CommissionApprovalInvalidError('Approved commission cannot be recalculated'))
        }
        const preview = await this.previewWith(repositories.commissions, repositories.payments, context, bookingId, input)
        if (!preview.ok) return preview
        const periodRecord = await repositories.commissions.findOrCreatePeriod(this.scope(context), {
          id: this.dependencies.ids.generate(), startsAt: preview.value.period.dateFrom, endsAt: preview.value.period.dateTo })
        if (periodRecord.status !== 'OPEN') return failure(new CommissionPeriodLockedError('Commission period is not open'))
        const lines = new Map(preview.value.items.map((line) => [line.bookingItemId, line]))
        const adjustments: CommissionAdjustmentRecord[] = []
        for (const source of histories) {
          const line = lines.get(source.bookingItemId); if (!line) continue
          const previous = source.effectiveAmount; const delta = cents(line.commissionAmount) - cents(previous)
          if (delta === 0n) continue
          adjustments.push(await repositories.commissions.createAdjustment({ id: this.dependencies.ids.generate(),
            organizationId: context.subject.organizationId, branchId: context.branchId, commissionHistoryId: source.id,
            commissionPeriodId: periodRecord.id, bookingItemId: source.bookingItemId, employeeId: source.employeeId,
            commissionRuleId: line.commissionRuleId, paymentRefundId: null, createdByUserId: context.subject.userId,
            type: 'RECALCULATION', ruleName: line.ruleName, commissionType: line.type, basis: line.basis,
            baseAmount: line.baseAmount, percentageRate: line.percentageRate, fixedAmount: line.fixedAmount,
            previousAmount: previous, adjustmentAmount: money(delta), resultingAmount: line.commissionAmount,
            reason: input.reason, calculatedAt: this.dependencies.clock.utc() }))
        }
        return success(adjustments)
      })
    return this.publish(result, CommissionEventName.RECALCULATED, bookingId, {})
  }

  async applyRefundAdjustment(context: CommissionUseCaseContext, refundId: string, reason?: string) {
    const allowed = this.authorize(context, 'commission.adjust'); if (!allowed.ok) return allowed
    const result = await this.dependencies.transactions.withTransaction<readonly CommissionAdjustmentRecord[], DomainError>(
      async (repositories) => {
        const refund = await repositories.commissions.findRefund(this.scope(context), refundId)
        if (!refund) return failure(new NotFoundError('Payment refund was not found'))
        const payment = await repositories.payments.findById(this.scope(context), refund.paymentId)
        if (!payment.ok) return failure(new NotFoundError('Refund payment was not found'))
        await repositories.commissions.acquireLocks(this.scope(context),
          [`booking:${payment.value.bookingId}`, `payment:${refund.paymentId}`, `refund:${refundId}`])
        const existing = await repositories.commissions.findRefundAdjustments(this.scope(context), refundId)
        if (existing.length) return success(existing)
        const histories = await repositories.commissions.findByBooking(this.scope(context), payment.value.bookingId)
        if (!histories.length) return failure(new CommissionAdjustmentInvalidError('Commission must be calculated before refund adjustment'))
        const data = await repositories.payments.findBookingFinancials(this.scope(context), payment.value.bookingId)
        if (!data) return failure(new NotFoundError('Refund booking was not found'))
        const summary = this.dependencies.paymentFinancials.summarize(data); if (!summary.ok) return summary
        const refunds = data.payments.flatMap((entry) => entry.status === 'VOID' ? [] : entry.refunds)
          .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime() || left.id.localeCompare(right.id))
        const targetIndex = refunds.findIndex(({ id }) => id === refundId)
        if (targetIndex < 0) return failure(new CommissionAdjustmentInvalidError('Refund is missing from payment history'))
        for (const earlier of refunds.slice(0, targetIndex)) {
          if (!(await repositories.commissions.findRefundAdjustments(this.scope(context), earlier.id)).length) {
            return failure(new CommissionAdjustmentInvalidError('Earlier refunds must be adjusted first',
              { refundId: earlier.id }))
          }
        }
        const grossPaid = data.payments.filter(({ status }) => status !== 'VOID')
          .reduce((total, entry) => total + cents(entry.amount), 0n)
        const refundedThroughTarget = refunds.slice(0, targetIndex + 1)
          .reduce((total, entry) => total + cents(entry.amount), 0n)
        const netPaidThroughTarget = grossPaid - refundedThroughTarget
        const bases = this.dependencies.engine.allocateBases(summary.value.items, summary.value.bookingDiscountAmount,
          money(netPaidThroughTarget), summary.value.grandTotal); if (!bases.ok) return bases
        const byItem = new Map(bases.value.map((base) => [base.bookingItemId, base]))
        const originalInstant = histories[0]!.saleClosedAt; if (!originalInstant) {
          return failure(new CommissionAdjustmentInvalidError('Commission source has no closed-sale timestamp'))
        }
        const originalPeriod = await repositories.commissions.findPeriodContaining(this.scope(context), originalInstant)
        const postingRange = originalPeriod?.status === 'OPEN'
          ? { dateFrom: originalPeriod.startsAt, dateTo: originalPeriod.endsAt } : calendarMonth(refund.createdAt)
        const postingPeriod = await repositories.commissions.findOrCreatePeriod(this.scope(context), {
          id: this.dependencies.ids.generate(), startsAt: postingRange.dateFrom, endsAt: postingRange.dateTo })
        if (postingPeriod.status !== 'OPEN') {
          return failure(new CommissionPeriodLockedError('Refund adjustment posting period is not open'))
        }
        const created: CommissionAdjustmentRecord[] = []
        for (const source of [...histories].sort((a, b) => a.bookingItemId.localeCompare(b.bookingItemId))) {
          const base = byItem.get(source.bookingItemId); if (!base) continue
          const latest = source.adjustments.at(-1); const previousBase = latest?.baseAmount ?? source.baseAmount
          const target = this.dependencies.engine.proportionalRefundTarget(source.effectiveAmount, previousBase,
            base.commissionBaseAmount); if (!target.ok) return target
          const delta = cents(target.value) - cents(source.effectiveAmount)
          if (delta >= 0n) continue
          created.push(await repositories.commissions.createAdjustment({ id: this.dependencies.ids.generate(),
            organizationId: context.subject.organizationId, branchId: context.branchId, commissionHistoryId: source.id,
            commissionPeriodId: postingPeriod.id, bookingItemId: source.bookingItemId, employeeId: source.employeeId,
            commissionRuleId: latest?.commissionRuleId ?? source.commissionRuleId, paymentRefundId: refund.id,
            createdByUserId: context.subject.userId, type: 'REFUND', ruleName: latest?.ruleName ?? source.ruleName,
            commissionType: latest?.commissionType ?? source.type, basis: latest?.basis ?? source.basis,
            baseAmount: base.commissionBaseAmount, percentageRate: latest?.percentageRate ?? source.percentageRate,
            fixedAmount: latest?.fixedAmount ?? source.fixedAmount, previousAmount: source.effectiveAmount,
            adjustmentAmount: money(delta), resultingAmount: target.value, reason: reason ?? refund.reason,
            calculatedAt: this.dependencies.clock.utc() }))
        }
        if (!created.length) return failure(new CommissionAdjustmentInvalidError('Refund does not reduce an effective commission'))
        return success(created)
      })
    return this.publish(result, CommissionEventName.ADJUSTMENT_APPLIED, refundId, { refundId })
  }

  async approve(context: CommissionUseCaseContext, commissionId: string, input: CommissionPeriodRequest & { reason: string }) {
    const allowed = this.authorize(context, 'commission.approve'); if (!allowed.ok) return allowed
    const range = requiredRange(input); if (!range.ok) return range
    const result = await this.dependencies.transactions.withTransaction<unknown, DomainError>(async (repositories) => {
      await repositories.commissions.acquireLocks(this.scope(context), [`commission:${commissionId}`,
        `period:${range.value.dateFrom.toISOString()}:${range.value.dateTo.toISOString()}`])
      const source = await repositories.commissions.findById(this.scope(context), commissionId)
      if (!source.ok) return source
      const target = await repositories.commissions.findOrCreatePeriod(this.scope(context), {
        id: this.dependencies.ids.generate(), startsAt: range.value.dateFrom, endsAt: range.value.dateTo })
      if (target.status === 'LOCKED') return failure(new CommissionPeriodLockedError('Commission period is locked'))
      if (source.value.approvals.some(({ commissionPeriodId }) => commissionPeriodId === target.id)) {
        return failure(new CommissionApprovalInvalidError('Commission ledger entry is already approved for this period'))
      }
      const ledgerAmount = await repositories.commissions.ledgerAmountForPeriod(this.scope(context), commissionId,
        range.value.dateFrom, range.value.dateTo)
      if (ledgerAmount === null) return failure(new CommissionApprovalInvalidError('Commission has no ledger entry in this period'))
      const at = this.dependencies.clock.utc()
      const approval = await repositories.commissions.createApproval(this.scope(context), { id: this.dependencies.ids.generate(),
        commissionHistoryId: commissionId, commissionPeriodId: target.id, approvedByUserId: context.subject.userId,
        approvedAmount: ledgerAmount, reason: input.reason, approvedAt: at })
      if (!approval) return failure(new CommissionApprovalInvalidError('Commission approval could not be created'))
      const unapproved = await repositories.commissions.countUnapprovedInPeriod(this.scope(context),
        range.value.dateFrom, range.value.dateTo)
      if (unapproved === 0) await repositories.commissions.markPeriodApproved(this.scope(context), target.id,
        context.subject.userId, at, input.reason)
      return success(approval)
    })
    return this.publish(result, CommissionEventName.APPROVED, commissionId, {})
  }

  async lockPeriod(context: CommissionUseCaseContext, input: CommissionPeriodRequest & { reason: string }) {
    const allowed = this.authorize(context, 'commission.lock'); if (!allowed.ok) return allowed
    const range = requiredRange(input); if (!range.ok) return range
    const result = await this.dependencies.transactions.withTransaction<unknown, DomainError>(async (repositories) => {
      await repositories.commissions.acquireLocks(this.scope(context),
        [`period:${range.value.dateFrom.toISOString()}:${range.value.dateTo.toISOString()}`])
      let target = await repositories.commissions.findPeriod(this.scope(context), range.value.dateFrom, range.value.dateTo)
      if (!target) return failure(new NotFoundError('Commission period was not found'))
      if (target.status === 'LOCKED') return failure(new CommissionPeriodLockedError('Commission period is already locked'))
      const summaries = await repositories.commissions.summarize(this.scope(context), range.value.dateFrom, range.value.dateTo)
      if (!summaries.some(({ itemCount }) => itemCount > 0)) {
        return failure(new CommissionApprovalInvalidError('Empty commission period cannot be locked'))
      }
      const unapproved = await repositories.commissions.countUnapprovedInPeriod(this.scope(context),
        range.value.dateFrom, range.value.dateTo)
      if (unapproved > 0) return failure(new CommissionApprovalInvalidError('Every commission must be approved before lock'))
      if (target.status === 'OPEN') target = await repositories.commissions.markPeriodApproved(this.scope(context), target.id,
        context.subject.userId, this.dependencies.clock.utc(), 'All commissions approved') ?? target
      const locked = await repositories.commissions.lockPeriod(this.scope(context), target.id, context.subject.userId,
        this.dependencies.clock.utc(), input.reason)
      return locked ? success(locked) : failure(new CommissionApprovalInvalidError('Commission period could not be locked'))
    })
    return this.publish(result, CommissionEventName.PERIOD_LOCKED, context.branchId, {})
  }

  async getPeriodStatus(context: CommissionUseCaseContext, input: CommissionPeriodRequest) {
    const allowed = this.authorize(context, 'commission.read'); if (!allowed.ok) return allowed
    const range = requiredRange(input); if (!range.ok) return range
    const value = await this.dependencies.repository.findPeriod(this.scope(context), range.value.dateFrom, range.value.dateTo)
    return value ? success(value) : failure(new NotFoundError('Commission period was not found'))
  }

  async summary(context: CommissionUseCaseContext, input: CommissionPeriodRequest, employeeId?: string) {
    const allowed = this.authorize(context, 'commission.summary.read'); if (!allowed.ok) return allowed
    const range = requiredRange(input); if (!range.ok) return range
    const value = await this.dependencies.repository.summarize(this.scope(context), range.value.dateFrom,
      range.value.dateTo, employeeId)
    return this.publish(success(value), CommissionEventName.SUMMARY_GENERATED, employeeId ?? context.branchId,
      employeeId ? { employeeId } : {})
  }

  async applicableRule(context: CommissionUseCaseContext, employeeId: string, serviceId: string, effectiveAt: Date) {
    const allowed = this.authorize(context, 'commission.rule.read'); if (!allowed.ok) return allowed
    const rule = await this.dependencies.repository.findApplicableRule(this.scope(context), employeeId, serviceId, effectiveAt)
    return rule ? success(rule) : failure(new CommissionRuleNotFoundError('Applicable commission rule was not found'))
  }

  private async calculateRange(context: CommissionUseCaseContext, range: PeriodRange, employeeId?: string) {
    return this.dependencies.transactions.withTransaction<readonly CommissionHistoryRecord[], DomainError>(async (repositories) => {
      await repositories.commissions.acquireLocks(this.scope(context),
        [`period:${range.dateFrom.toISOString()}:${range.dateTo.toISOString()}`])
      const period = await repositories.commissions.findOrCreatePeriod(this.scope(context), {
        id: this.dependencies.ids.generate(), startsAt: range.dateFrom, endsAt: range.dateTo })
      if (period.status !== 'OPEN') return failure(new CommissionPeriodLockedError('Commission period is not open'))
      const bookingIds = await repositories.commissions.findEligibleBookingIds(this.scope(context), range.dateFrom,
        range.dateTo, employeeId)
      await repositories.commissions.acquireLocks(this.scope(context), bookingIds.map((id) => `booking:${id}`))
      const created: CommissionHistoryRecord[] = []
      for (const bookingId of bookingIds) {
        const preview = await this.previewWith(repositories.commissions, repositories.payments, context, bookingId, range)
        if (!preview.ok) return preview
        const filtered = employeeId ? { ...preview.value,
          items: preview.value.items.filter((line) => line.employeeId === employeeId) } : preview.value
        const persisted = await this.persistPreview(repositories.commissions, context, filtered)
        if (!persisted.ok) return persisted
        created.push(...persisted.value)
      }
      return success(created)
    })
  }

  private async persistPreview(repository: CommissionRepository, context: CommissionUseCaseContext,
    preview: BookingCommissionPreview): Promise<Result<readonly CommissionHistoryRecord[], DomainError>> {
    const target = await repository.findOrCreatePeriod(this.scope(context), { id: this.dependencies.ids.generate(),
      startsAt: preview.period.dateFrom, endsAt: preview.period.dateTo })
    if (target.status !== 'OPEN') return failure(new CommissionPeriodLockedError('Commission period is not open'))
    const created: CommissionHistoryRecord[] = []
    for (const line of preview.items) {
      if (await repository.findHistoryByBookingItem(this.scope(context), line.bookingItemId)) {
        return failure(new CommissionAlreadyCalculatedError('Commission was already calculated for a booking item'))
      }
      created.push(await repository.createHistory({ id: this.dependencies.ids.generate(), bookingItemId: line.bookingItemId,
        employeeId: line.employeeId, commissionRuleId: line.commissionRuleId, paymentId: null, ruleName: line.ruleName,
        type: line.type, basis: line.basis, baseAmount: line.baseAmount, percentageRate: line.percentageRate,
        fixedAmount: line.fixedAmount, commissionAmount: line.commissionAmount,
        calculatedAt: this.dependencies.clock.utc() }))
    }
    return success(created)
  }

  private async previewMany(repositories: Pick<RepositorySet, 'commissions' | 'payments'>,
    context: CommissionUseCaseContext, bookingIds: readonly string[], range: PeriodRange) {
    const values: BookingCommissionPreview[] = []
    for (const bookingId of bookingIds) {
      const preview = await this.previewWith(repositories.commissions, repositories.payments, context, bookingId, range)
      if (!preview.ok) return preview
      values.push(preview.value)
    }
    return success(values)
  }

  private async previewWith(commissions: CommissionRepository, payments: PaymentRepository,
    context: CommissionUseCaseContext, bookingId: string, input: CommissionPeriodRequest | PeriodRange) {
    const data = await payments.findBookingFinancials(this.scope(context), bookingId)
    if (!data) return failure(new NotFoundError('Booking was not found'))
    const eligibility = eligibleBooking(data); if (!eligibility.ok) return eligibility
    const summary = this.dependencies.paymentFinancials.summarize(data); if (!summary.ok) return summary
    const allocation = this.dependencies.engine.allocateBases(summary.value.items, summary.value.bookingDiscountAmount,
      summary.value.paidAmount, summary.value.grandTotal); if (!allocation.ok) return allocation
    const rangeResult = resolveRange(input, data.saleClosedAt!); if (!rangeResult.ok) return rangeResult
    const currentByEmployee = new Map<string, bigint>()
    for (const item of allocation.value) currentByEmployee.set(item.employeeId,
      (currentByEmployee.get(item.employeeId) ?? 0n) + cents(item.commissionBaseAmount))
    const existingByEmployee = new Map<string, bigint>()
    for (const employeeId of currentByEmployee.keys()) {
      const existing = await commissions.findByEmployee(this.scope(context), employeeId,
        rangeResult.value.dateFrom, rangeResult.value.dateTo)
      existingByEmployee.set(employeeId, existing.filter((record) => record.bookingId !== bookingId)
        .reduce((total, record) => total + cents(record.adjustments.at(-1)?.baseAmount ?? record.baseAmount), 0n))
    }
    const lines: CommissionPreviewLine[] = []
    for (const base of allocation.value) {
      if (cents(base.commissionBaseAmount) === 0n) continue
      const rule = await commissions.findApplicableRule(this.scope(context), base.employeeId, base.serviceId, data.saleClosedAt!)
      if (!rule) return failure(new CommissionRuleNotFoundError('Applicable commission rule was not found',
        { employeeId: base.employeeId, serviceId: base.serviceId }))
      const cumulative = (existingByEmployee.get(base.employeeId) ?? 0n) + (currentByEmployee.get(base.employeeId) ?? 0n)
      const calculated = this.dependencies.engine.calculate(rule, base.commissionBaseAmount, money(cumulative))
      if (!calculated.ok) return calculated
      lines.push({ bookingId, bookingItemId: base.bookingItemId, employeeId: base.employeeId,
        serviceId: base.serviceId, serviceName: base.serviceName, commissionRuleId: rule.id, ruleName: rule.name,
        type: rule.type, basis: rule.basis, baseAmount: base.commissionBaseAmount,
        percentageRate: calculated.value.percentageRate, fixedAmount: calculated.value.fixedAmount,
        commissionAmount: calculated.value.commissionAmount })
    }
    return success({ bookingId, bookingNumber: data.bookingNumber, branchId: data.branchId,
      saleClosedAt: data.saleClosedAt!, period: rangeResult.value, netPaidAmount: summary.value.paidAmount, items: lines,
      totalCommissionAmount: money(lines.reduce((total, line) => total + cents(line.commissionAmount), 0n)) })
  }

  private scope(context: CommissionUseCaseContext): TenantScope {
    return { organizationId: context.subject.organizationId, branchId: context.branchId }
  }
  private authorize(context: CommissionUseCaseContext, permission: string) {
    return this.dependencies.policyEngine.authorize(this.dependencies.policy, context.subject, { permission },
      { organizationId: context.subject.organizationId, branchId: context.branchId, ownerId: null })
  }
  private publish<T>(result: Result<T, DomainError>, name: string, aggregateId: string,
    payload: Readonly<Record<string, unknown>>) {
    if (!result.ok) return Promise.resolve(result)
    return this.dependencies.events.publish([this.dependencies.eventFactory.create({ name, aggregateId,
      payload: { branchId: payload.branchId ?? aggregateId, ...payload } })]).then((published) => published.ok ? result : published)
  }
  private async publishCalculation(result: Result<readonly CommissionHistoryRecord[], DomainError>,
    primaryName: string, aggregateId: string): Promise<Result<readonly CommissionHistoryRecord[], DomainError>> {
    if (!result.ok) return result
    const names: { name: string; aggregateId: string; payload: Readonly<Record<string, unknown>> }[] = [
      { name: primaryName, aggregateId, payload: { branchId: aggregateId } },
    ]
    if (primaryName !== CommissionEventName.BOOKING_CALCULATED) {
      for (const bookingId of new Set(result.value.map(({ bookingId }) => bookingId))) {
        names.push({ name: CommissionEventName.BOOKING_CALCULATED, aggregateId: bookingId, payload: { bookingId } })
      }
    }
    for (const item of result.value) names.push({ name: CommissionEventName.ITEM_CALCULATED,
      aggregateId: item.bookingItemId, payload: { bookingId: item.bookingId, bookingItemId: item.bookingItemId,
        employeeId: item.employeeId } })
    const published = await this.dependencies.events.publish(names.map((event) => this.dependencies.eventFactory.create(event)))
    return published.ok ? result : published
  }
  private repositories() { return { commissions: this.dependencies.repository, payments: this.dependencies.payments } }
}

interface PeriodRange { dateFrom: Date; dateTo: Date }
function eligibleBooking(data: CheckoutFinancialRecord): Result<void, DomainError> {
  if (data.bookingStatus !== 'COMPLETED' || !data.saleClosedAt) {
    return failure(new CommissionCalculationNotAllowedError('Commission requires a completed, closed sale'))
  }
  if (!['PAID', 'PARTIAL'].includes(data.paymentStatus)) {
    return failure(new CommissionCalculationNotAllowedError('Commission requires a paid or partially paid booking'))
  }
  if (!data.items.some(({ status }) => status === 'COMPLETED')) {
    return failure(new CommissionCalculationNotAllowedError('Commission requires completed booking items'))
  }
  return success(undefined)
}
function resolveRange(input: CommissionPeriodRequest | PeriodRange, instant: Date): Result<PeriodRange, DomainError> {
  const optional = optionalRange(input); return optional.ok ? success(optional.value ?? calendarMonth(instant)) : optional
}
function requiredRange(input: CommissionPeriodRequest): Result<PeriodRange, DomainError> {
  const range = optionalRange(input); if (!range.ok) return range
  return range.value ? success(range.value) : failure(new BusinessRuleViolationError('dateFrom and dateTo are required'))
}
function optionalRange(input: { dateFrom?: string | Date | undefined; dateTo?: string | Date | undefined }): Result<PeriodRange | null, DomainError> {
  if (!input.dateFrom && !input.dateTo) return success(null)
  if (!input.dateFrom || !input.dateTo) return failure(new BusinessRuleViolationError('dateFrom and dateTo must be provided together'))
  const dateFrom = input.dateFrom instanceof Date ? input.dateFrom : new Date(input.dateFrom)
  const dateTo = input.dateTo instanceof Date ? input.dateTo : new Date(input.dateTo)
  return dateFrom < dateTo ? success({ dateFrom, dateTo })
    : failure(new BusinessRuleViolationError('dateFrom must be before dateTo'))
}
function calendarMonth(instant: Date): PeriodRange {
  return { dateFrom: new Date(Date.UTC(instant.getUTCFullYear(), instant.getUTCMonth(), 1)),
    dateTo: new Date(Date.UTC(instant.getUTCFullYear(), instant.getUTCMonth() + 1, 1)) }
}
function periodPreview(period: PeriodRange, bookings: readonly BookingCommissionPreview[]) {
  return { period, bookings, totalCommissionAmount: money(bookings.reduce((total, booking) =>
    total + cents(booking.totalCommissionAmount), 0n)) }
}

export function toCommissionListQuery(input: CommissionListRequest, branchId: string): CommissionListQuery {
  return { branchId: input.branchId ?? branchId, page: input.page, pageSize: input.pageSize, sort: input.sort,
    order: input.order, ...(input.keyword ? { keyword: input.keyword } : {}),
    ...(input.bookingId ? { bookingId: input.bookingId } : {}),
    ...(input.bookingItemId ? { bookingItemId: input.bookingItemId } : {}),
    ...(input.employeeId ? { employeeId: input.employeeId } : {}), ...(input.serviceId ? { serviceId: input.serviceId } : {}),
    ...(input.status ? { status: input.status } : {}), ...(input.dateFrom ? { dateFrom: new Date(input.dateFrom) } : {}),
    ...(input.dateTo ? { dateTo: new Date(input.dateTo) } : {}) }
}

export class PreviewBookingCommission { constructor(private readonly o: CommissionOperations) {} execute(c: CommissionUseCaseContext, id: string, i?: CommissionPeriodRequest) { return this.o.previewBooking(c, id, i) } }
export class PreviewEmployeeCommission { constructor(private readonly o: CommissionOperations) {} execute(c: CommissionUseCaseContext, id: string, i: CommissionPeriodRequest) { return this.o.previewEmployee(c, id, i) } }
export class PreviewCommissionPeriod { constructor(private readonly o: CommissionOperations) {} execute(c: CommissionUseCaseContext, i: CommissionPeriodRequest) { return this.o.previewPeriod(c, i) } }
export class CalculateBookingCommission { constructor(private readonly o: CommissionOperations) {} execute(c: CommissionUseCaseContext, id: string, i?: CommissionPeriodRequest) { return this.o.calculateBooking(c, id, i) } }
export class CalculateEmployeeCommission { constructor(private readonly o: CommissionOperations) {} execute(c: CommissionUseCaseContext, id: string, i: CommissionPeriodRequest) { return this.o.calculateEmployee(c, id, i) } }
export class CalculateCommissionPeriod { constructor(private readonly o: CommissionOperations) {} execute(c: CommissionUseCaseContext, i: CommissionPeriodRequest) { return this.o.calculatePeriod(c, i) } }
export class GetCommissionHistory { constructor(private readonly o: CommissionOperations) {} execute(c: CommissionUseCaseContext, id: string) { return this.o.get(c, id) } }
export class GetBookingCommissionHistory { constructor(private readonly o: CommissionOperations) {} execute(c: CommissionUseCaseContext, id: string) { return this.o.getBookingHistory(c, id) } }
export class GetEmployeeCommissionHistory { constructor(private readonly o: CommissionOperations) {} execute(c: CommissionUseCaseContext, id: string, i?: CommissionPeriodRequest) { return this.o.getEmployeeHistory(c, id, i) } }
export class GetCommissionList { constructor(private readonly o: CommissionOperations) {} execute(c: CommissionUseCaseContext, q: CommissionListQuery) { return this.o.getList(c, q) } }
export class RecalculateBookingCommission { constructor(private readonly o: CommissionOperations) {} execute(c: CommissionUseCaseContext, id: string, i: CommissionPeriodRequest & { reason: string }) { return this.o.recalculateBooking(c, id, i) } }
export class ApplyRefundCommissionAdjustment { constructor(private readonly o: CommissionOperations) {} execute(c: CommissionUseCaseContext, id: string, reason?: string) { return this.o.applyRefundAdjustment(c, id, reason) } }
export class ApproveCommission { constructor(private readonly o: CommissionOperations) {} execute(c: CommissionUseCaseContext, id: string, i: CommissionPeriodRequest & { reason: string }) { return this.o.approve(c, id, i) } }
export class LockCommissionPeriod { constructor(private readonly o: CommissionOperations) {} execute(c: CommissionUseCaseContext, i: CommissionPeriodRequest & { reason: string }) { return this.o.lockPeriod(c, i) } }
export class GetCommissionPeriodStatus { constructor(private readonly o: CommissionOperations) {} execute(c: CommissionUseCaseContext, i: CommissionPeriodRequest) { return this.o.getPeriodStatus(c, i) } }
export class GetApplicableCommissionRule { constructor(private readonly o: CommissionOperations) {} execute(c: CommissionUseCaseContext, e: string, s: string, at: Date) { return this.o.applicableRule(c, e, s, at) } }
export class GetEmployeeCommissionSummary { constructor(private readonly o: CommissionOperations) {} execute(c: CommissionUseCaseContext, id: string, i: CommissionPeriodRequest) { return this.o.summary(c, i, id) } }
export class GetBranchCommissionSummary { constructor(private readonly o: CommissionOperations) {} execute(c: CommissionUseCaseContext, i: CommissionPeriodRequest) { return this.o.summary(c, i) } }
export class GetCommissionSummaryByPeriod extends GetBranchCommissionSummary {}
