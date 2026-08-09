import { Router, type Request, type Response } from 'express'
import type { DomainError } from '../../domain/foundation/domain-errors.js'
import type { Result } from '../../domain/foundation/result.js'
import { unwrapResult } from '../../shared/http/domain-result.js'
import { sendSuccess } from '../../shared/http/response.js'
import { asyncHandler } from '../../shared/middleware/async-handler.js'
import { validateBody, validateQuery } from '../../shared/middleware/validate.js'
import { authenticate } from '../auth/auth.middleware.js'
import type { AuthService } from '../auth/auth.service.js'
import { requirePermissionAcrossAccessibleBranches as requirePermission } from '../rbac/permission.middleware.js'
import { resolveBranchContext } from '../tenant/tenant.middleware.js'
import type { TenantService } from '../tenant/tenant.service.js'
import type { DashboardReportModule } from './dashboard-report.module.js'
import type { ReportRow } from './dashboard-report.engine.js'
import { dashboardReportQuerySchema, exportRequestSchema, reportRequestSchema, type DashboardReportRequest,
  type ExportReportRequest, type ReportRequest, type ReportType } from './dashboard-report.schemas.js'
import type { DashboardReportContext } from './dashboard-report.use-cases.js'

function context(request: Request): DashboardReportContext {
  const principal = request.principal!
  return { userId: principal.userId, organizationId: principal.organizationId,
    grants: principal.grants.map((grant) => ({ branchId: grant.branchId, permissions: grant.permissions })),
    ...(request.header('x-branch-id') ? { headerBranchId: request.header('x-branch-id')! } : {}) }
}

function audit(response: Response, request: Request, action: string) {
  const branchId = request.header('x-branch-id')
  response.locals.auditContext = { organizationId: request.principal!.organizationId,
    userId: request.principal!.userId, ...(branchId ? { branchId } : {}), action }
}

function query(response: Response): DashboardReportRequest {
  return response.locals.validatedQuery as DashboardReportRequest
}

export function createDashboardRouter(module: DashboardReportModule, auth: AuthService, tenant: TenantService): Router {
  const router = Router(); router.use(authenticate(auth), resolveBranchContext(tenant, false))
  const get = (path: string, permission: string,
    execute: (context: DashboardReportContext, input: DashboardReportRequest) =>
      Promise<Result<ReportRow | readonly ReportRow[], DomainError>>) => {
    router.get(path, requirePermission(permission), validateQuery(dashboardReportQuerySchema), asyncHandler(async (request, response) => {
      sendSuccess(response, unwrapResult(await execute(context(request), query(response))))
    }))
  }
  get('/overview', 'dashboard.read', module.dashboard.overview.execute.bind(module.dashboard.overview))
  get('/business-health', 'dashboard.read', module.dashboard.businessHealth.execute.bind(module.dashboard.businessHealth))
  get('/trends', 'dashboard.read', module.dashboard.trends.execute.bind(module.dashboard.trends))
  get('/sales', 'sales.summary.read', module.sales.summary.execute.bind(module.sales.summary))
  get('/sales/trend', 'sales.summary.read', module.sales.trend.execute.bind(module.sales.trend))
  get('/sales/by-branch', 'sales.summary.read', module.sales.byBranch.execute.bind(module.sales.byBranch))
  get('/sales/by-service', 'sales.summary.read', module.sales.byService.execute.bind(module.sales.byService))
  get('/sales/by-employee', 'sales.summary.read', module.sales.byEmployee.execute.bind(module.sales.byEmployee))
  get('/bookings', 'booking.summary.read', module.bookings.summary.execute.bind(module.bookings.summary))
  get('/bookings/trend', 'booking.summary.read', module.bookings.trend.execute.bind(module.bookings.trend))
  get('/bookings/status-breakdown', 'booking.summary.read', module.bookings.statusBreakdown.execute.bind(module.bookings.statusBreakdown))
  get('/payments', 'payment.summary.read', module.payments.summary.execute.bind(module.payments.summary))
  get('/payments/method-breakdown', 'payment.summary.read', module.payments.methods.execute.bind(module.payments.methods))
  get('/payments/refunds', 'payment.summary.read', module.payments.refunds.execute.bind(module.payments.refunds))
  get('/payments/outstanding', 'payment.summary.read', module.payments.outstanding.execute.bind(module.payments.outstanding))
  get('/commissions', 'commission.summary.read', module.commissions.summary.execute.bind(module.commissions.summary))
  get('/commissions/by-employee', 'commission.summary.read', module.commissions.byEmployee.execute.bind(module.commissions.byEmployee))
  get('/commissions/by-branch', 'commission.summary.read', module.commissions.byBranch.execute.bind(module.commissions.byBranch))
  get('/commissions/by-period', 'commission.summary.read', module.commissions.byPeriod.execute.bind(module.commissions.byPeriod))
  get('/employees/performance', 'employee.performance.read', module.employees.summary.execute.bind(module.employees.summary))
  get('/services/performance', 'service.performance.read', module.services.summary.execute.bind(module.services.summary))
  get('/customers/analytics', 'customer.analytics.read', module.customers.summary.execute.bind(module.customers.summary))
  get('/branches/summary', 'branch.summary.read', module.branches.summary.execute.bind(module.branches.summary))
  return router
}

const reportPermission: Record<ReportType, string> = { sales: 'sales.summary.read', bookings: 'booking.summary.read',
  payments: 'payment.summary.read', commissions: 'commission.summary.read',
  'employee-performance': 'employee.performance.read', 'service-performance': 'service.performance.read',
  customers: 'customer.analytics.read', branches: 'branch.summary.read' }

export function createReportRouter(module: DashboardReportModule, auth: AuthService, tenant: TenantService): Router {
  const router = Router(); router.use(authenticate(auth), resolveBranchContext(tenant, false))
  router.get('/', requirePermission('report.read'), asyncHandler(async (request, response) => {
    sendSuccess(response, unwrapResult(await module.reports.available.execute(context(request))))
  }))
  const generators: Record<ReportType, typeof module.reports.sales> = {
    sales: module.reports.sales, bookings: module.reports.bookings, payments: module.reports.payments,
    commissions: module.reports.commissions, 'employee-performance': module.reports.employees,
    'service-performance': module.reports.services, customers: module.reports.customers, branches: module.reports.branches,
  }
  const paths: Record<ReportType, string> = { sales: '/sales', bookings: '/bookings', payments: '/payments',
    commissions: '/commissions', 'employee-performance': '/employees/performance',
    'service-performance': '/services/performance', customers: '/customers', branches: '/branches' }
  for (const type of Object.keys(paths) as ReportType[]) {
    router.post(paths[type], requirePermission('report.read'), requirePermission(reportPermission[type]),
      validateBody(reportRequestSchema), asyncHandler(async (request, response) => {
        audit(response, request, 'report.generated')
        sendSuccess(response, unwrapResult(await generators[type].execute(context(request), request.body as ReportRequest)))
      }))
    router.post(`${paths[type]}/export`, requirePermission('report.export'), requirePermission(reportPermission[type]),
      validateBody(exportRequestSchema), asyncHandler(async (request, response) => {
        audit(response, request, 'report.exported'); const input = request.body as ExportReportRequest
        const artifact = unwrapResult(await (input.format === 'csv' ? module.reports.exportCsv : module.reports.exportExcel)
          .execute(context(request), type, input))
        response.status(200).set({ 'Content-Type': artifact.contentType,
          'Content-Disposition': `attachment; filename="${artifact.filename}"`, 'Content-Length': String(artifact.buffer.length),
          'X-Content-Type-Options': 'nosniff' }).send(artifact.buffer)
      }))
  }
  return router
}
