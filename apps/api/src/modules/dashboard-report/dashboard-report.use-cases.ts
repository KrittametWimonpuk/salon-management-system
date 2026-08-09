import { DateTime } from 'luxon'
import type { DashboardReportRepository, DashboardReportSnapshot } from '../../application/foundation/dashboard-report-repository.js'
import type { DashboardReportPolicy, PolicyEngine, PolicySubject } from '../../application/foundation/policy.js'
import { ReportDateRangeInvalidError, ReportDateRangeTooLargeError, ReportDataIntegrityError,
  ReportRowLimitExceededError, TenantIsolationError, type DomainError } from '../../domain/foundation/domain-errors.js'
import type { DomainEventFactory, DomainEventPublisher } from '../../domain/foundation/domain-events.js'
import { failure, success, type Result } from '../../domain/foundation/result.js'
import type { Clock } from '../../domain/foundation/time.js'
import { validateSnapshot, type DashboardReportEngine, type ReportRow,
  type ResolvedReportRange } from './dashboard-report.engine.js'
import { DashboardReportEventName, type DashboardReportEventNameValue } from './dashboard-report.events.js'
import type { DashboardReportExporter, ExportArtifact } from './dashboard-report.exporter.js'
import { reportTypes, type DashboardReportRequest, type ExportReportRequest, type ReportRequest,
  type ReportType } from './dashboard-report.schemas.js'

const DASHBOARD_ROW_LIMIT = 50_000
const REPORT_ROW_LIMIT = 10_000
const MAX_RANGE_DAYS = 366

export interface DashboardReportGrant {
  branchId: string | null
  permissions: readonly string[]
}

export interface DashboardReportContext {
  userId: string
  organizationId: string
  grants: readonly DashboardReportGrant[]
  headerBranchId?: string
}

export interface DashboardReportDependencies {
  repository: DashboardReportRepository
  policyEngine: PolicyEngine
  policy: DashboardReportPolicy
  eventFactory: DomainEventFactory
  events: DomainEventPublisher
  clock: Clock
  engine: DashboardReportEngine
  exporter: DashboardReportExporter
}

interface LoadedReport {
  snapshot: DashboardReportSnapshot
  range: ResolvedReportRange
  branchIds: readonly string[] | null
}

export interface GeneratedReport {
  reportType: ReportType
  timezone: string
  dateFrom: string
  dateTo: string
  summary: ReportRow
  rows: readonly ReportRow[]
  page: number
  pageSize: number
  totalItems: number
  totalPages: number
}

export class DashboardReportOperations {
  constructor(readonly dependencies: DashboardReportDependencies) {}

  async dashboard(context: DashboardReportContext, input: DashboardReportRequest, permission: string,
    eventName: DashboardReportEventNameValue, select: (engine: DashboardReportEngine, snapshot: DashboardReportSnapshot,
      range: ResolvedReportRange) => ReportRow | readonly ReportRow[]): Promise<Result<ReportRow | readonly ReportRow[], DomainError>> {
    const loaded = await this.load(context, input, permission, DASHBOARD_ROW_LIMIT)
    if (!loaded.ok) return loaded
    try {
      const output = select(this.dependencies.engine, loaded.value.snapshot, loaded.value.range)
      const published = await this.publish(context, eventName, { permission, dateFrom: loaded.value.range.dateFrom.toISOString(),
        dateTo: loaded.value.range.dateTo.toISOString(), timezone: loaded.value.range.timezone })
      if (!published.ok) return published
      if (eventName !== DashboardReportEventName.DASHBOARD_VIEWED) {
        const viewed = await this.publish(context, DashboardReportEventName.DASHBOARD_VIEWED, { permission })
        if (!viewed.ok) return viewed
      }
      return success(output)
    } catch (error) { return failure(asIntegrityError(error)) }
  }

  async generate(context: DashboardReportContext, type: ReportType,
    input: ReportRequest): Promise<Result<GeneratedReport, DomainError>> {
    const reportAllowed = this.authorize(context, 'report.read', input.branchId)
    if (!reportAllowed.ok) return reportAllowed
    const permission = reportPermission(type)
    const loaded = await this.load(context, input, permission, REPORT_ROW_LIMIT)
    if (!loaded.ok) return loaded
    try {
      let rows = [...this.dependencies.engine.reportRows(type, loaded.value.snapshot, loaded.value.range)]
      rows = filterRows(rows, input.keyword, input.status)
      rows.sort(compareRows(input.sort, input.order))
      const totalItems = rows.length; const start = (input.page - 1) * input.pageSize
      const output: GeneratedReport = { reportType: type, timezone: loaded.value.range.timezone,
        dateFrom: loaded.value.range.dateFrom.toISOString(), dateTo: loaded.value.range.dateTo.toISOString(),
        summary: this.dependencies.engine.reportSummary(type, loaded.value.snapshot, loaded.value.range),
        rows: rows.slice(start, start + input.pageSize), page: input.page, pageSize: input.pageSize,
        totalItems, totalPages: Math.ceil(totalItems / input.pageSize) }
      const published = await this.publish(context, DashboardReportEventName.REPORT_GENERATED,
        { reportType: type, totalItems, timezone: loaded.value.range.timezone })
      return published.ok ? success(output) : published
    } catch (error) { return failure(asIntegrityError(error)) }
  }

  async export(context: DashboardReportContext, type: ReportType,
    input: ExportReportRequest): Promise<Result<ExportArtifact, DomainError>> {
    const exportAllowed = this.authorize(context, 'report.export', input.branchId)
    if (!exportAllowed.ok) return exportAllowed
    const loaded = await this.load(context, input, reportPermission(type), REPORT_ROW_LIMIT)
    if (!loaded.ok) return loaded
    try {
      let rows = [...this.dependencies.engine.reportRows(type, loaded.value.snapshot, loaded.value.range)]
      rows = filterRows(rows, input.keyword, input.status); rows.sort(compareRows(input.sort, input.order))
      const summary = input.includeSummary
        ? this.dependencies.engine.reportSummary(type, loaded.value.snapshot, loaded.value.range) : undefined
      const artifact = input.format === 'csv'
        ? this.dependencies.exporter.csv(type, rows, input.columns, loaded.value.range.timezone, summary)
        : await this.dependencies.exporter.excel(type, rows, input.columns, loaded.value.range.timezone, summary, input.title)
      if (!artifact.ok) return artifact
      const published = await this.publish(context, DashboardReportEventName.REPORT_EXPORTED,
        { reportType: type, format: input.format, rowCount: rows.length, filename: artifact.value.filename })
      return published.ok ? artifact : published
    } catch (error) { return failure(asIntegrityError(error)) }
  }

  authorize(context: DashboardReportContext, permission: string, requestedBranchId?: string): Result<readonly string[] | null, DomainError> {
    const organizationWide = context.grants.some((grant) => grant.branchId === null && grant.permissions.includes(permission))
    const allowedBranches = [...new Set(context.grants.flatMap((grant) => grant.branchId !== null
      && grant.permissions.includes(permission) ? [grant.branchId] : []))]
    const requested = requestedBranchId ?? context.headerBranchId
    if (requested && !organizationWide && !allowedBranches.includes(requested)) {
      return failure(new TenantIsolationError('Report branch is not accessible for the required permission',
        { branchId: requested, permission }))
    }
    const branchIds = requested ? [requested] : organizationWide ? null : allowedBranches
    const subject: PolicySubject = { userId: context.userId, organizationId: context.organizationId,
      branchIds: new Set(branchIds ?? []), permissions: new Set(organizationWide || allowedBranches.length ? [permission] : []) }
    const allowed = this.dependencies.policyEngine.authorize(this.dependencies.policy, subject, { permission }, {
      organizationId: context.organizationId, ...(requested ? { branchId: requested } : {}) })
    return allowed.ok ? success(branchIds) : allowed
  }

  private async load(context: DashboardReportContext, input: DashboardReportRequest,
    permission: string, limit: number): Promise<Result<LoadedReport, DomainError>> {
    const branchIds = this.authorize(context, permission, input.branchId)
    if (!branchIds.ok) return branchIds
    const range = resolveReportRange(input, this.dependencies.clock)
    if (!range.ok) return range
    const snapshot = await this.dependencies.repository.loadSnapshot({ organizationId: context.organizationId,
      branchIds: branchIds.value, dateFrom: range.value.dateFrom, dateTo: range.value.dateTo,
      ...(input.employeeId ? { employeeId: input.employeeId } : {}), ...(input.serviceId ? { serviceId: input.serviceId } : {}),
      ...(input.customerId ? { customerId: input.customerId } : {}), limit })
    if (snapshot.truncated) return failure(new ReportRowLimitExceededError('Report row limit was exceeded', { limit }))
    const validated = validateSnapshot(snapshot)
    return validated.ok ? success({ snapshot: validated.value, range: range.value, branchIds: branchIds.value }) : validated
  }

  private publish(context: DashboardReportContext, name: DashboardReportEventNameValue,
    payload: Readonly<Record<string, unknown>>): Promise<Result<void, DomainError>> {
    return this.dependencies.events.publish([this.dependencies.eventFactory.create({ name,
      aggregateId: context.organizationId, payload: { organizationId: context.organizationId, userId: context.userId, ...payload } })])
  }
}

type DashboardSelector = (engine: DashboardReportEngine, snapshot: DashboardReportSnapshot,
  range: ResolvedReportRange) => ReportRow | readonly ReportRow[]

class DashboardReadUseCase {
  constructor(private readonly operations: DashboardReportOperations, private readonly permission: string,
    private readonly event: DashboardReportEventNameValue, private readonly selector: DashboardSelector) {}
  execute(context: DashboardReportContext, input: DashboardReportRequest) {
    return this.operations.dashboard(context, input, this.permission, this.event, this.selector)
  }
}

export class GetDashboardOverview extends DashboardReadUseCase { constructor(ops: DashboardReportOperations) {
  super(ops, 'dashboard.read', DashboardReportEventName.DASHBOARD_VIEWED, (e, s, r) => e.overview(s, r)) } }
export class GetBusinessHealthSummary extends DashboardReadUseCase { constructor(ops: DashboardReportOperations) {
  super(ops, 'dashboard.read', DashboardReportEventName.DASHBOARD_VIEWED, (e, s, r) => e.businessHealth(s, r)) } }
export class GetTrendSeries extends DashboardReadUseCase { constructor(ops: DashboardReportOperations) {
  super(ops, 'dashboard.read', DashboardReportEventName.DASHBOARD_VIEWED, (e, s, r) => e.trends(s, r)) } }
export class GetSalesSummary extends DashboardReadUseCase { constructor(ops: DashboardReportOperations) {
  super(ops, 'sales.summary.read', DashboardReportEventName.SALES_SUMMARY_GENERATED, (e, s) => e.salesSummary(s)) } }
export class GetSalesTrend extends DashboardReadUseCase { constructor(ops: DashboardReportOperations) {
  super(ops, 'sales.summary.read', DashboardReportEventName.SALES_SUMMARY_GENERATED, (e, s, r) => e.salesTrend(s, r)) } }
export class GetSalesByBranch extends DashboardReadUseCase { constructor(ops: DashboardReportOperations) {
  super(ops, 'sales.summary.read', DashboardReportEventName.SALES_SUMMARY_GENERATED, (e, s) => e.salesByBranch(s)) } }
export class GetSalesByService extends DashboardReadUseCase { constructor(ops: DashboardReportOperations) {
  super(ops, 'sales.summary.read', DashboardReportEventName.SALES_SUMMARY_GENERATED, (e, s) => e.salesByService(s)) } }
export class GetSalesByEmployee extends DashboardReadUseCase { constructor(ops: DashboardReportOperations) {
  super(ops, 'sales.summary.read', DashboardReportEventName.SALES_SUMMARY_GENERATED, (e, s, r) => e.salesByEmployee(s, r)) } }
export class GetBookingSummary extends DashboardReadUseCase { constructor(ops: DashboardReportOperations) {
  super(ops, 'booking.summary.read', DashboardReportEventName.BOOKING_SUMMARY_GENERATED, (e, s, r) => e.bookingSummary(s, r)) } }
export class GetBookingTrend extends DashboardReadUseCase { constructor(ops: DashboardReportOperations) {
  super(ops, 'booking.summary.read', DashboardReportEventName.BOOKING_SUMMARY_GENERATED, (e, s, r) => e.bookingTrend(s, r)) } }
export class GetBookingStatusBreakdown extends DashboardReadUseCase { constructor(ops: DashboardReportOperations) {
  super(ops, 'booking.summary.read', DashboardReportEventName.BOOKING_SUMMARY_GENERATED, (e, s) => e.bookingStatusBreakdown(s)) } }
export class GetNoShowCancellationSummary extends DashboardReadUseCase { constructor(ops: DashboardReportOperations) {
  super(ops, 'booking.summary.read', DashboardReportEventName.BOOKING_SUMMARY_GENERATED, (e, s) => e.noShowCancellation(s)) } }
export class GetPaymentSummary extends DashboardReadUseCase { constructor(ops: DashboardReportOperations) {
  super(ops, 'payment.summary.read', DashboardReportEventName.PAYMENT_SUMMARY_GENERATED, (e, s) => e.paymentSummary(s)) } }
export class GetPaymentMethodBreakdown extends DashboardReadUseCase { constructor(ops: DashboardReportOperations) {
  super(ops, 'payment.summary.read', DashboardReportEventName.PAYMENT_SUMMARY_GENERATED, (e, s) => e.paymentMethodBreakdown(s)) } }
export class GetRefundSummary extends DashboardReadUseCase { constructor(ops: DashboardReportOperations) {
  super(ops, 'payment.summary.read', DashboardReportEventName.PAYMENT_SUMMARY_GENERATED, (e, s) => e.refundSummary(s)) } }
export class GetOutstandingPaymentSummary extends DashboardReadUseCase { constructor(ops: DashboardReportOperations) {
  super(ops, 'payment.summary.read', DashboardReportEventName.PAYMENT_SUMMARY_GENERATED, (e, s) => e.outstandingSummary(s)) } }
export class GetCommissionSummary extends DashboardReadUseCase { constructor(ops: DashboardReportOperations) {
  super(ops, 'commission.summary.read', DashboardReportEventName.COMMISSION_SUMMARY_GENERATED, (e, s) => e.commissionSummary(s)) } }
export class GetCommissionByEmployee extends DashboardReadUseCase { constructor(ops: DashboardReportOperations) {
  super(ops, 'commission.summary.read', DashboardReportEventName.COMMISSION_SUMMARY_GENERATED, (e, s) => e.commissionBy(s, 'employee')) } }
export class GetCommissionByBranch extends DashboardReadUseCase { constructor(ops: DashboardReportOperations) {
  super(ops, 'commission.summary.read', DashboardReportEventName.COMMISSION_SUMMARY_GENERATED, (e, s) => e.commissionBy(s, 'branch')) } }
export class GetCommissionPeriodSummary extends DashboardReadUseCase { constructor(ops: DashboardReportOperations) {
  super(ops, 'commission.summary.read', DashboardReportEventName.COMMISSION_SUMMARY_GENERATED, (e, s) => e.commissionBy(s, 'period')) } }
export class GetEmployeePerformanceSummary extends DashboardReadUseCase { constructor(ops: DashboardReportOperations) {
  super(ops, 'employee.performance.read', DashboardReportEventName.EMPLOYEE_PERFORMANCE_GENERATED, (e, s, r) => e.employeePerformance(s, r)) } }
export class GetEmployeeRanking extends GetEmployeePerformanceSummary {}
export class GetEmployeeServiceBreakdown extends DashboardReadUseCase { constructor(ops: DashboardReportOperations) {
  super(ops, 'employee.performance.read', DashboardReportEventName.EMPLOYEE_PERFORMANCE_GENERATED, (e, s) => e.employeeServiceBreakdown(s)) } }
export class GetServicePerformanceSummary extends DashboardReadUseCase { constructor(ops: DashboardReportOperations) {
  super(ops, 'service.performance.read', DashboardReportEventName.SERVICE_PERFORMANCE_GENERATED, (e, s) => e.servicePerformance(s)) } }
export class GetTopServices extends GetServicePerformanceSummary {}
export class GetServiceRevenueTrend extends DashboardReadUseCase { constructor(ops: DashboardReportOperations) {
  super(ops, 'service.performance.read', DashboardReportEventName.SERVICE_PERFORMANCE_GENERATED, (e, s, r) => e.serviceRevenueTrend(s, r)) } }
export class GetCustomerAnalyticsSummary extends DashboardReadUseCase { constructor(ops: DashboardReportOperations) {
  super(ops, 'customer.analytics.read', DashboardReportEventName.CUSTOMER_ANALYTICS_GENERATED, (e, s, r) => e.customerAnalytics(s, r)) } }
export class GetNewVsReturningCustomers extends DashboardReadUseCase { constructor(ops: DashboardReportOperations) {
  super(ops, 'customer.analytics.read', DashboardReportEventName.CUSTOMER_ANALYTICS_GENERATED, (e, s, r) => e.newVsReturning(s, r)) } }
export class GetTopCustomers extends DashboardReadUseCase { constructor(ops: DashboardReportOperations) {
  super(ops, 'customer.analytics.read', DashboardReportEventName.CUSTOMER_ANALYTICS_GENERATED, (e, s) => e.topCustomers(s)) } }
export class GetBranchSummary extends DashboardReadUseCase { constructor(ops: DashboardReportOperations) {
  super(ops, 'branch.summary.read', DashboardReportEventName.BRANCH_SUMMARY_GENERATED, (e, s) => e.branchPerformance(s)) } }
export class GetBranchComparison extends GetBranchSummary {}

export class GetAvailableReports {
  constructor(private readonly operations: DashboardReportOperations) {}
  execute(context: DashboardReportContext): Promise<Result<readonly {
    type: ReportType
    formats: readonly ['json', 'csv', 'xlsx']
  }[], DomainError>> {
    const allowed = this.operations.authorize(context, 'report.read')
    return Promise.resolve(allowed.ok
      ? success(reportTypes.map((type) => ({ type, formats: ['json', 'csv', 'xlsx'] as const })))
      : allowed)
  }
}

class GenerateReportUseCase {
  constructor(private readonly operations: DashboardReportOperations, private readonly type: ReportType) {}
  execute(context: DashboardReportContext, input: ReportRequest) { return this.operations.generate(context, this.type, input) }
}
export class GenerateSalesReport extends GenerateReportUseCase { constructor(ops: DashboardReportOperations) { super(ops, 'sales') } }
export class GenerateBookingReport extends GenerateReportUseCase { constructor(ops: DashboardReportOperations) { super(ops, 'bookings') } }
export class GeneratePaymentReport extends GenerateReportUseCase { constructor(ops: DashboardReportOperations) { super(ops, 'payments') } }
export class GenerateCommissionReport extends GenerateReportUseCase { constructor(ops: DashboardReportOperations) { super(ops, 'commissions') } }
export class GenerateEmployeePerformanceReport extends GenerateReportUseCase { constructor(ops: DashboardReportOperations) { super(ops, 'employee-performance') } }
export class GenerateServicePerformanceReport extends GenerateReportUseCase { constructor(ops: DashboardReportOperations) { super(ops, 'service-performance') } }
export class GenerateCustomerReport extends GenerateReportUseCase { constructor(ops: DashboardReportOperations) { super(ops, 'customers') } }
export class GenerateBranchReport extends GenerateReportUseCase { constructor(ops: DashboardReportOperations) { super(ops, 'branches') } }

export class ExportReportCsv {
  constructor(private readonly operations: DashboardReportOperations) {}
  execute(context: DashboardReportContext, type: ReportType, input: ExportReportRequest) {
    return this.operations.export(context, type, { ...input, format: 'csv' })
  }
}
export class ExportReportExcel {
  constructor(private readonly operations: DashboardReportOperations) {}
  execute(context: DashboardReportContext, type: ReportType, input: ExportReportRequest) {
    return this.operations.export(context, type, { ...input, format: 'xlsx' })
  }
}

export function resolveReportRange(input: Pick<DashboardReportRequest, 'dateFrom' | 'dateTo' | 'period' | 'timezone' | 'granularity'>,
  clock: Clock): Result<ResolvedReportRange, DomainError> {
  const zone = input.timezone; const now = DateTime.fromJSDate(clock.utc(), { zone })
  let from: DateTime; let to: DateTime
  if (input.dateFrom && input.dateTo) {
    from = parseBoundary(input.dateFrom, zone, false); to = parseBoundary(input.dateTo, zone, true)
  } else {
    switch (input.period ?? 'THIS_MONTH') {
      case 'TODAY': from = now.startOf('day'); to = from.plus({ days: 1 }); break
      case 'THIS_WEEK': from = now.startOf('week'); to = from.plus({ weeks: 1 }); break
      case 'THIS_MONTH': from = now.startOf('month'); to = from.plus({ months: 1 }); break
      case 'LAST_MONTH': to = now.startOf('month'); from = to.minus({ months: 1 }); break
      case 'THIS_YEAR': from = now.startOf('year'); to = from.plus({ years: 1 }); break
    }
  }
  if (!from.isValid || !to.isValid || from >= to) return failure(new ReportDateRangeInvalidError('Report date range is invalid'))
  if (to.diff(from, 'days').days > MAX_RANGE_DAYS) return failure(new ReportDateRangeTooLargeError(
    'Report date range cannot exceed one year', { maxDays: MAX_RANGE_DAYS }))
  return success({ dateFrom: from.toUTC().toJSDate(), dateTo: to.toUTC().toJSDate(), timezone: zone,
    granularity: input.granularity })
}

function parseBoundary(value: string, timezone: string, end: boolean): DateTime {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const date = DateTime.fromISO(value, { zone: timezone }).startOf('day'); return end ? date.plus({ days: 1 }) : date
  }
  return DateTime.fromISO(value, { setZone: true }).toUTC()
}

function reportPermission(type: ReportType): string {
  const permissions: Record<ReportType, string> = { sales: 'sales.summary.read', bookings: 'booking.summary.read',
    payments: 'payment.summary.read', commissions: 'commission.summary.read',
    'employee-performance': 'employee.performance.read', 'service-performance': 'service.performance.read',
    customers: 'customer.analytics.read', branches: 'branch.summary.read' }
  return permissions[type]
}

function filterRows(rows: readonly ReportRow[], keyword?: string, status?: string): ReportRow[] {
  const normalized = keyword?.toLocaleLowerCase('en-US')
  return rows.filter((row) => (!status || String(row.status ?? row.paymentStatus ?? row.periodStatus ?? '') === status)
    && (!normalized || Object.values(row).some((value) => String(value ?? '').toLocaleLowerCase('en-US').includes(normalized))))
}

function compareRows(field: string, order: 'asc' | 'desc') {
  const direction = order === 'asc' ? 1 : -1
  return (left: ReportRow, right: ReportRow): number => {
    const a = left[field] ?? left.date ?? ''; const b = right[field] ?? right.date ?? ''
    return direction * (typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b)))
  }
}

function asIntegrityError(error: unknown): ReportDataIntegrityError {
  return error instanceof ReportDataIntegrityError ? error
    : new ReportDataIntegrityError('Report data could not be aggregated safely')
}
