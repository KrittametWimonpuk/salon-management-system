import { describe, expect, it } from 'vitest'
import type { DashboardReportQuery, DashboardReportRepository,
  DashboardReportSnapshot } from '../../src/application/foundation/dashboard-report-repository.js'
import { DashboardReportPolicy, PolicyEngine } from '../../src/application/foundation/policy.js'
import { DomainEventFactory, InProcessDomainEventDispatcher } from '../../src/domain/foundation/domain-events.js'
import { FixedClock } from '../../src/infrastructure/foundation/system-adapters.js'
import { DashboardReportEngine } from '../../src/modules/dashboard-report/dashboard-report.engine.js'
import { DashboardReportExporter } from '../../src/modules/dashboard-report/dashboard-report.exporter.js'
import { DashboardReportOperations, GenerateSalesReport, GetDashboardOverview,
  type DashboardReportContext } from '../../src/modules/dashboard-report/dashboard-report.use-cases.js'

const emptySnapshot = (truncated = false): DashboardReportSnapshot => ({ sales: [], bookings: [], payments: [], refunds: [],
  commissions: [], commissionAdjustments: [], customers: [], branches: [], workingHours: [], timeOffs: [], holidays: [], truncated })

class FakeReportRepository implements DashboardReportRepository {
  query: DashboardReportQuery | null = null
  constructor(readonly snapshot = emptySnapshot()) {}
  async loadSnapshot(query: DashboardReportQuery): Promise<DashboardReportSnapshot> { this.query = query; return this.snapshot }
}

function operations(repository: DashboardReportRepository) {
  const clock = new FixedClock(new Date('2026-08-09T03:00:00.000Z'))
  return new DashboardReportOperations({ repository, policyEngine: new PolicyEngine(), policy: new DashboardReportPolicy(),
    eventFactory: new DomainEventFactory(clock, { generate: () => 'event-id' }),
    events: new InProcessDomainEventDispatcher(), clock, engine: new DashboardReportEngine(),
    exporter: new DashboardReportExporter() })
}

const input = { period: 'THIS_MONTH' as const, timezone: 'Asia/Bangkok', granularity: 'daily' as const,
  page: 1, pageSize: 50, sort: 'date', order: 'desc' as const }
const context = (permission: string, branchId: string | null = 'branch-1'): DashboardReportContext => ({
  userId: 'user-1', organizationId: 'organization-1', grants: [{ branchId, permissions: [permission] }],
})

describe('Dashboard report use cases', () => {
  it('scopes branch grants and organization-wide grants before repository access', async () => {
    const branchRepository = new FakeReportRepository(); const branchUseCase = new GetDashboardOverview(operations(branchRepository))
    expect((await branchUseCase.execute(context('dashboard.read'), input)).ok).toBe(true)
    expect(branchRepository.query?.branchIds).toEqual(['branch-1'])
    const organizationRepository = new FakeReportRepository()
    expect((await new GetDashboardOverview(operations(organizationRepository))
      .execute(context('dashboard.read', null), input)).ok).toBe(true)
    expect(organizationRepository.query?.branchIds).toBeNull()
  })

  it('rejects inaccessible branch filters and missing policy permissions', async () => {
    const useCase = new GetDashboardOverview(operations(new FakeReportRepository()))
    expect(await useCase.execute(context('dashboard.read'), { ...input, branchId: 'branch-2' }))
      .toMatchObject({ ok: false, error: { code: 'TENANT_ISOLATION' } })
    expect(await useCase.execute(context('other.permission'), input))
      .toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } })
  })

  it('fails closed when a bounded repository snapshot is truncated', async () => {
    expect(await new GetDashboardOverview(operations(new FakeReportRepository(emptySnapshot(true))))
      .execute(context('dashboard.read'), input)).toMatchObject({ ok: false,
        error: { code: 'BUSINESS_RULE_VIOLATION', details: { limit: 50000 } } })
  })

  it('requires both report.read and the report-domain permission', async () => {
    const report = new GenerateSalesReport(operations(new FakeReportRepository()))
    expect(await report.execute(context('sales.summary.read'), input)).toMatchObject({ ok: false,
      error: { code: 'FORBIDDEN' } })
    const allowed: DashboardReportContext = { userId: 'user-1', organizationId: 'organization-1',
      grants: [{ branchId: 'branch-1', permissions: ['report.read', 'sales.summary.read'] }] }
    expect(await report.execute(allowed, input)).toMatchObject({ ok: true,
      value: { reportType: 'sales', totalItems: 0, page: 1, pageSize: 50 } })
  })
})
