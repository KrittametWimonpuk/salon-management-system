import type { Prisma } from '@prisma/client'
import type {
  CommissionAdjustmentRecord,
  CommissionApprovalRecord,
  CommissionHistoryRecord,
  CommissionListQuery,
  CommissionPeriodRecord,
  CommissionRepository,
  CommissionSummaryRecord,
  CreateCommissionAdjustmentData,
  CreateCommissionHistoryData,
  PaymentRefundRecord,
  TenantScope,
} from '../../application/foundation/repositories.js'
import type { PageResult } from '../../application/foundation/query.js'
import { NotFoundError } from '../../domain/foundation/domain-errors.js'
import { failure, success } from '../../domain/foundation/result.js'
import type { PrismaDatabase } from './prisma-repositories.js'

const adjustmentSelect = {
  id: true, commissionHistoryId: true, commissionPeriodId: true, bookingItemId: true, employeeId: true,
  commissionRuleId: true, paymentRefundId: true, createdByUserId: true, type: true, ruleName: true,
  commissionType: true, basis: true, baseAmount: true, percentageRate: true, fixedAmount: true,
  previousAmount: true, adjustmentAmount: true, resultingAmount: true, reason: true, calculatedAt: true,
  createdAt: true,
} satisfies Prisma.CommissionAdjustmentSelect

const approvalSelect = {
  id: true, commissionHistoryId: true, commissionPeriodId: true, approvedByUserId: true,
  approvedAmount: true, reason: true, approvedAt: true, createdAt: true,
} satisfies Prisma.CommissionApprovalSelect

const historySelect = {
  id: true, bookingItemId: true, employeeId: true, commissionRuleId: true, paymentId: true,
  ruleName: true, type: true, basis: true, baseAmount: true, percentageRate: true, fixedAmount: true,
  commissionAmount: true, calculatedAt: true,
  employee: { select: { displayName: true } },
  bookingItem: { select: { serviceId: true, serviceName: true, booking: { select: {
    id: true, bookingNumber: true, saleClosedAt: true, branch: { select: { id: true, organizationId: true } },
  } } } },
  adjustments: { select: adjustmentSelect, orderBy: [{ calculatedAt: 'asc' }, { id: 'asc' }] },
  approvals: { select: approvalSelect, orderBy: [{ approvedAt: 'asc' }, { id: 'asc' }] },
} satisfies Prisma.CommissionHistorySelect

type SelectedHistory = Prisma.CommissionHistoryGetPayload<{ select: typeof historySelect }>
type SelectedAdjustment = Prisma.CommissionAdjustmentGetPayload<{ select: typeof adjustmentSelect }>
type SelectedApproval = Prisma.CommissionApprovalGetPayload<{ select: typeof approvalSelect }>

function decimal(value: Prisma.Decimal | null): string | null { return value?.toFixed(2) ?? null }
function adjustment(value: SelectedAdjustment): CommissionAdjustmentRecord {
  return { ...value, baseAmount: value.baseAmount.toFixed(2), percentageRate: decimal(value.percentageRate),
    fixedAmount: decimal(value.fixedAmount), previousAmount: value.previousAmount.toFixed(2),
    adjustmentAmount: value.adjustmentAmount.toFixed(2), resultingAmount: value.resultingAmount.toFixed(2) }
}
function approval(value: SelectedApproval): CommissionApprovalRecord {
  return { ...value, approvedAmount: value.approvedAmount.toFixed(2) }
}
function history(value: SelectedHistory): CommissionHistoryRecord {
  const adjustments = value.adjustments.map(adjustment)
  const effectiveAmount = adjustments.at(-1)?.resultingAmount ?? value.commissionAmount.toFixed(2)
  return { id: value.id, organizationId: value.bookingItem.booking.branch.organizationId,
    branchId: value.bookingItem.booking.branch.id, bookingId: value.bookingItem.booking.id,
    bookingNumber: value.bookingItem.booking.bookingNumber, bookingItemId: value.bookingItemId,
    serviceId: value.bookingItem.serviceId, serviceName: value.bookingItem.serviceName, employeeId: value.employeeId,
    employeeName: value.employee.displayName, commissionRuleId: value.commissionRuleId, paymentId: value.paymentId,
    ruleName: value.ruleName, type: value.type, basis: value.basis, baseAmount: value.baseAmount.toFixed(2),
    percentageRate: decimal(value.percentageRate), fixedAmount: decimal(value.fixedAmount),
    commissionAmount: value.commissionAmount.toFixed(2), effectiveAmount, calculatedAt: value.calculatedAt,
    saleClosedAt: value.bookingItem.booking.saleClosedAt, adjustments,
    approvals: value.approvals.map(approval) }
}

function period(value: { id: string; organizationId: string; branchId: string; startsAt: Date; endsAt: Date;
  status: CommissionPeriodRecord['status']; approvedByUserId: string | null; approvedAt: Date | null;
  approvalReason: string | null; lockedByUserId: string | null; lockedAt: Date | null; lockReason: string | null;
  createdAt: Date; updatedAt: Date }): CommissionPeriodRecord { return value }

export class PrismaCommissionRepository implements CommissionRepository {
  constructor(private readonly database: PrismaDatabase) {}

  async findById(scope: TenantScope, id: string) {
    const value = await this.database.commissionHistory.findFirst({ where: { id, ...this.historyScope(scope) },
      select: historySelect })
    return value ? success(history(value)) : failure(new NotFoundError('Commission was not found'))
  }

  async acquireLocks(scope: TenantScope, keys: readonly string[]) {
    for (const key of [...new Set(keys)].sort()) {
      await this.database.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${scope.organizationId}:commission:${key}`}, 0))`
    }
  }

  async findApplicableRule(scope: TenantScope, employeeId: string, serviceId: string, effectiveAt: Date) {
    const branchScopes: Prisma.CommissionRuleWhereInput[] = [{ branchId: null }]
    if (scope.branchId) branchScopes.push({ branchId: scope.branchId })
    const rules = await this.database.commissionRule.findMany({ where: { organizationId: scope.organizationId,
      isActive: true, deletedAt: null, effectiveFrom: { lte: effectiveAt },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: effectiveAt } }],
      AND: [{ OR: branchScopes },
        { OR: [{ employeeId: null }, { employeeId }] }, { OR: [{ serviceId: null }, { serviceId }] }] },
    include: { tiers: { where: { deletedAt: null }, orderBy: [{ minimumAmount: 'asc' }, { id: 'asc' }] } } })
    const selected = rules.sort((left, right) => specificity(right) - specificity(left)
      || right.priority - left.priority || right.effectiveFrom.getTime() - left.effectiveFrom.getTime()
      || left.id.localeCompare(right.id))[0]
    if (!selected) return null
    return { id: selected.id, organizationId: selected.organizationId, branchId: selected.branchId,
      employeeId: selected.employeeId, serviceId: selected.serviceId, name: selected.name, type: selected.type,
      basis: selected.basis, percentageRate: decimal(selected.percentageRate), fixedAmount: decimal(selected.fixedAmount),
      priority: selected.priority, effectiveFrom: selected.effectiveFrom, effectiveTo: selected.effectiveTo,
      tiers: selected.tiers.map((tier) => ({ id: tier.id, minimumAmount: tier.minimumAmount.toFixed(2),
        maximumAmount: decimal(tier.maximumAmount), percentageRate: decimal(tier.percentageRate),
        fixedAmount: decimal(tier.fixedAmount) })) }
  }

  async findHistoryByBookingItem(scope: TenantScope, bookingItemId: string) {
    const value = await this.database.commissionHistory.findFirst({ where: { bookingItemId, ...this.historyScope(scope) },
      select: historySelect })
    return value ? history(value) : null
  }

  async findByBooking(scope: TenantScope, bookingId: string) {
    const values = await this.database.commissionHistory.findMany({ where: { bookingItem: { bookingId },
      ...this.historyScope(scope) }, select: historySelect, orderBy: [{ calculatedAt: 'asc' }, { id: 'asc' }] })
    return values.map(history)
  }

  async findByEmployee(scope: TenantScope, employeeId: string, startsAt?: Date, endsAt?: Date) {
    const values = await this.database.commissionHistory.findMany({ where: { employeeId, ...this.historyScope(scope),
      ...(startsAt || endsAt ? { bookingItem: { ...this.bookingItemScope(scope), booking: {
        ...this.bookingScope(scope), saleClosedAt: { ...(startsAt ? { gte: startsAt } : {}),
          ...(endsAt ? { lt: endsAt } : {}) } } } } : {}) }, select: historySelect,
    orderBy: [{ calculatedAt: 'asc' }, { id: 'asc' }] })
    return values.map(history)
  }

  async findPage(scope: TenantScope, query: CommissionListQuery): Promise<PageResult<CommissionHistoryRecord>> {
    const where: Prisma.CommissionHistoryWhereInput = { ...this.historyScope(scope),
      ...(query.bookingId ? { bookingItem: { bookingId: query.bookingId } } : {}),
      ...(query.bookingItemId ? { bookingItemId: query.bookingItemId } : {}),
      ...(query.employeeId ? { employeeId: query.employeeId } : {}),
      ...(query.serviceId ? { bookingItem: { serviceId: query.serviceId } } : {}),
      ...(query.status === 'APPROVED' ? { approvals: { some: {} } } : {}),
      ...(query.status === 'PENDING' ? { approvals: { none: {} } } : {}),
      ...(query.dateFrom || query.dateTo ? { calculatedAt: { ...(query.dateFrom ? { gte: query.dateFrom } : {}),
        ...(query.dateTo ? { lt: query.dateTo } : {}) } } : {}),
      ...(query.keyword ? { OR: [{ employee: { displayName: { contains: query.keyword, mode: 'insensitive' } } },
        { bookingItem: { serviceName: { contains: query.keyword, mode: 'insensitive' } } },
        { bookingItem: { booking: { bookingNumber: { contains: query.keyword, mode: 'insensitive' } } } }] } : {}) }
    const orderBy: Prisma.CommissionHistoryOrderByWithRelationInput = query.sort === 'employeeName'
      ? { employee: { displayName: query.order } } : query.sort === 'serviceName'
        ? { bookingItem: { serviceName: query.order } } : { [query.sort]: query.order }
    const [values, totalItems] = await Promise.all([this.database.commissionHistory.findMany({ where,
      select: historySelect, orderBy, skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
    this.database.commissionHistory.count({ where })])
    return { items: values.map(history), page: query.page, pageSize: query.pageSize, totalItems,
      totalPages: Math.ceil(totalItems / query.pageSize) }
  }

  async findEligibleBookingIds(scope: TenantScope, startsAt: Date, endsAt: Date, employeeId?: string) {
    const values = await this.database.booking.findMany({ where: { ...this.bookingScope(scope), status: 'COMPLETED',
      paymentStatus: { in: ['PAID', 'PARTIAL'] }, saleClosedAt: { gte: startsAt, lt: endsAt },
      items: { some: { status: 'COMPLETED', ...(employeeId ? { employeeId } : {}) } } },
    select: { id: true }, orderBy: [{ saleClosedAt: 'asc' }, { id: 'asc' }] })
    return values.map(({ id }) => id)
  }

  async createHistory(data: CreateCommissionHistoryData) {
    return history(await this.database.commissionHistory.create({ data, select: historySelect }))
  }

  async createAdjustment(data: CreateCommissionAdjustmentData) {
    return adjustment(await this.database.commissionAdjustment.create({ data: {
      ...data, type: data.type, commissionType: data.commissionType,
    }, select: adjustmentSelect }))
  }

  async findRefund(scope: TenantScope, refundId: string): Promise<PaymentRefundRecord | null> {
    const value = await this.database.paymentRefund.findFirst({ where: { id: refundId, payment: { booking: this.bookingScope(scope) } },
      select: { id: true, paymentId: true, refundedByUserId: true, amount: true, currency: true, reason: true,
        externalReference: true, notes: true, createdAt: true, updatedAt: true,
        refundedBy: { select: { displayName: true } } } })
    return value ? { id: value.id, paymentId: value.paymentId, refundedByUserId: value.refundedByUserId,
      cashierName: value.refundedBy?.displayName ?? null, amount: value.amount.toFixed(2), currency: value.currency,
      reason: value.reason, externalReference: value.externalReference, notes: value.notes,
      createdAt: value.createdAt, updatedAt: value.updatedAt } : null
  }

  async findRefundAdjustments(scope: TenantScope, refundId: string) {
    const values = await this.database.commissionAdjustment.findMany({ where: { paymentRefundId: refundId,
      organizationId: scope.organizationId, ...(scope.branchId ? { branchId: scope.branchId } : {}) },
    select: adjustmentSelect, orderBy: { bookingItemId: 'asc' } })
    return values.map(adjustment)
  }

  async findOrCreatePeriod(scope: TenantScope, data: { id: string; startsAt: Date; endsAt: Date }) {
    if (!scope.branchId) throw new Error('Branch scope is required for commission periods')
    return period(await this.database.commissionPeriod.upsert({ where: { organizationId_branchId_startsAt_endsAt: {
      organizationId: scope.organizationId, branchId: scope.branchId, startsAt: data.startsAt, endsAt: data.endsAt } },
    create: { ...data, organizationId: scope.organizationId, branchId: scope.branchId }, update: {} }))
  }

  async findPeriod(scope: TenantScope, startsAt: Date, endsAt: Date) {
    const value = await this.database.commissionPeriod.findFirst({ where: { organizationId: scope.organizationId,
      ...(scope.branchId ? { branchId: scope.branchId } : {}), startsAt, endsAt } })
    return value ? period(value) : null
  }

  async findPeriodContaining(scope: TenantScope, instant: Date) {
    const value = await this.database.commissionPeriod.findFirst({ where: { organizationId: scope.organizationId,
      ...(scope.branchId ? { branchId: scope.branchId } : {}), startsAt: { lte: instant }, endsAt: { gt: instant } },
    orderBy: { startsAt: 'desc' } })
    return value ? period(value) : null
  }

  async createApproval(scope: TenantScope, data: { id: string; commissionHistoryId: string; commissionPeriodId: string;
    approvedByUserId: string; approvedAmount: string; reason: string; approvedAt: Date }) {
    const source = await this.findById(scope, data.commissionHistoryId); if (!source.ok) return null
    const targetPeriod = await this.database.commissionPeriod.findFirst({ where: { id: data.commissionPeriodId,
      organizationId: scope.organizationId, ...(scope.branchId ? { branchId: scope.branchId } : {}) } })
    if (!targetPeriod) return null
    return approval(await this.database.commissionApproval.create({ data: { ...data,
      organizationId: scope.organizationId, branchId: source.value.branchId }, select: approvalSelect }))
  }

  async ledgerAmountForPeriod(scope: TenantScope, commissionHistoryId: string, startsAt: Date, endsAt: Date) {
    const source = await this.findById(scope, commissionHistoryId); if (!source.ok) return null
    const includesBase = source.value.saleClosedAt !== null && source.value.saleClosedAt >= startsAt
      && source.value.saleClosedAt < endsAt
    const values = await this.database.commissionAdjustment.findMany({ where: { commissionHistoryId,
      organizationId: scope.organizationId, ...(scope.branchId ? { branchId: scope.branchId } : {}),
      commissionPeriod: { startsAt, endsAt } }, select: { adjustmentAmount: true } })
    if (!includesBase && !values.length) return null
    const amount = (includesBase ? cents(source.value.commissionAmount) : 0n)
      + values.reduce((total, value) => total + cents(value.adjustmentAmount.toFixed(2)), 0n)
    return money(amount)
  }

  async countUnapprovedInPeriod(scope: TenantScope, startsAt: Date, endsAt: Date) {
    const [base, adjustments, targetPeriod] = await Promise.all([
      this.database.commissionHistory.findMany({ where: { ...this.historyScope(scope), bookingItem: {
        ...this.bookingItemScope(scope), booking: { ...this.bookingScope(scope), saleClosedAt: { gte: startsAt, lt: endsAt } } } },
      select: { id: true } }),
      this.database.commissionAdjustment.findMany({ where: { organizationId: scope.organizationId,
        ...(scope.branchId ? { branchId: scope.branchId } : {}), commissionPeriod: { startsAt, endsAt } },
      select: { commissionHistoryId: true } }),
      this.findPeriod(scope, startsAt, endsAt),
    ])
    const ids = [...new Set([...base.map(({ id }) => id), ...adjustments.map(({ commissionHistoryId }) => commissionHistoryId)])]
    if (!ids.length) return 0
    const approved = targetPeriod ? await this.database.commissionApproval.count({ where: {
      commissionPeriodId: targetPeriod.id, commissionHistoryId: { in: ids }, organizationId: scope.organizationId,
      ...(scope.branchId ? { branchId: scope.branchId } : {}) } }) : 0
    return ids.length - approved
  }

  async markPeriodApproved(scope: TenantScope, periodId: string, userId: string, at: Date, reason: string) {
    const updated = await this.database.commissionPeriod.updateMany({ where: { id: periodId,
      organizationId: scope.organizationId, ...(scope.branchId ? { branchId: scope.branchId } : {}), status: 'OPEN' },
    data: { status: 'APPROVED', approvedByUserId: userId, approvedAt: at, approvalReason: reason } })
    if (!updated.count) return this.findPeriodById(scope, periodId)
    return this.findPeriodById(scope, periodId)
  }

  async lockPeriod(scope: TenantScope, periodId: string, userId: string, at: Date, reason: string) {
    const updated = await this.database.commissionPeriod.updateMany({ where: { id: periodId,
      organizationId: scope.organizationId, ...(scope.branchId ? { branchId: scope.branchId } : {}), status: 'APPROVED' },
    data: { status: 'LOCKED', lockedByUserId: userId, lockedAt: at, lockReason: reason } })
    return updated.count ? this.findPeriodById(scope, periodId) : null
  }

  async summarize(scope: TenantScope, startsAt: Date, endsAt: Date, employeeId?: string): Promise<readonly CommissionSummaryRecord[]> {
    const base = await this.database.commissionHistory.findMany({ where: { ...this.historyScope(scope),
      ...(employeeId ? { employeeId } : {}), bookingItem: { ...this.bookingItemScope(scope), booking: {
        ...this.bookingScope(scope), saleClosedAt: { gte: startsAt, lt: endsAt } } } },
    select: { id: true, employeeId: true, commissionAmount: true, employee: { select: { displayName: true } } } })
    const adjustments = await this.database.commissionAdjustment.findMany({ where: { organizationId: scope.organizationId,
      ...(scope.branchId ? { branchId: scope.branchId } : {}), ...(employeeId ? { employeeId } : {}),
      commissionPeriod: { startsAt, endsAt } }, select: { commissionHistoryId: true, employeeId: true,
        adjustmentAmount: true, employee: { select: { displayName: true } } } })
    const approvals = await this.database.commissionApproval.findMany({ where: { organizationId: scope.organizationId,
      ...(scope.branchId ? { branchId: scope.branchId } : {}), commissionPeriod: { startsAt, endsAt },
      ...(employeeId ? { commissionHistory: { employeeId } } : {}) }, select: { approvedAmount: true,
        commissionHistory: { select: { employeeId: true, employee: { select: { displayName: true } } } } } })
    const grouped = new Map<string, { value: CommissionSummaryRecord; sources: Set<string> }>()
    const entry = (id: string, name: string) => { const current = grouped.get(id); if (current) return current
      const created = { value: { employeeId: id, employeeName: name, baseCommissionAmount: '0.00',
        adjustmentAmount: '0.00', effectiveCommissionAmount: '0.00', approvedCommissionAmount: '0.00', itemCount: 0 },
      sources: new Set<string>() }; grouped.set(id, created); return created }
    for (const value of base) { const target = entry(value.employeeId, value.employee.displayName)
      const amount = value.commissionAmount.toFixed(2); target.value.baseCommissionAmount = money(cents(target.value.baseCommissionAmount) + cents(amount))
      target.value.effectiveCommissionAmount = money(cents(target.value.effectiveCommissionAmount) + cents(amount)); target.sources.add(value.id) }
    for (const value of adjustments) { const target = entry(value.employeeId, value.employee.displayName)
      const amount = value.adjustmentAmount.toFixed(2); target.value.adjustmentAmount = money(cents(target.value.adjustmentAmount) + cents(amount))
      target.value.effectiveCommissionAmount = money(cents(target.value.effectiveCommissionAmount) + cents(amount)); target.sources.add(value.commissionHistoryId) }
    for (const value of approvals) { const target = entry(value.commissionHistory.employeeId,
      value.commissionHistory.employee.displayName); target.value.approvedCommissionAmount = money(
        cents(target.value.approvedCommissionAmount) + cents(value.approvedAmount.toFixed(2))) }
    return [...grouped.values()].map(({ value, sources }) => ({ ...value, itemCount: sources.size }))
      .sort((left, right) => left.employeeName.localeCompare(right.employeeName) || left.employeeId.localeCompare(right.employeeId))
  }

  private historyScope(scope: TenantScope): Prisma.CommissionHistoryWhereInput {
    return { bookingItem: this.bookingItemScope(scope) }
  }
  private bookingItemScope(scope: TenantScope): Prisma.BookingItemWhereInput {
    return { booking: this.bookingScope(scope) }
  }
  private bookingScope(scope: TenantScope): Prisma.BookingWhereInput {
    return { ...(scope.branchId ? { branchId: scope.branchId } : {}), deletedAt: null,
      branch: { organizationId: scope.organizationId, deletedAt: null } }
  }
  private async findPeriodById(scope: TenantScope, id: string) {
    const value = await this.database.commissionPeriod.findFirst({ where: { id, organizationId: scope.organizationId,
      ...(scope.branchId ? { branchId: scope.branchId } : {}) } })
    return value ? period(value) : null
  }
}

function specificity(rule: { employeeId: string | null; serviceId: string | null; branchId: string | null }) {
  return (rule.employeeId ? 4 : 0) + (rule.serviceId ? 2 : 0) + (rule.branchId ? 1 : 0)
}
function cents(value: string) {
  const [whole = '0', fraction = ''] = value.split('.'); const sign = whole.startsWith('-') ? -1n : 1n
  return BigInt(whole) * 100n + sign * BigInt(fraction.padEnd(2, '0').slice(0, 2))
}
function money(value: bigint) {
  const sign = value < 0n ? '-' : ''; const absolute = value < 0n ? -value : value
  return `${sign}${absolute / 100n}.${(absolute % 100n).toString().padStart(2, '0')}`
}
