import type { ApplicationFoundation } from '../../composition-root.js'
import { DashboardReportEngine } from './dashboard-report.engine.js'
import { DashboardReportExporter } from './dashboard-report.exporter.js'
import { DashboardReportOperations, ExportReportCsv, ExportReportExcel, GenerateBookingReport,
  GenerateBranchReport, GenerateCommissionReport, GenerateCustomerReport, GenerateEmployeePerformanceReport,
  GeneratePaymentReport, GenerateSalesReport, GenerateServicePerformanceReport, GetAvailableReports,
  GetBookingStatusBreakdown, GetBookingSummary, GetBookingTrend, GetBranchComparison, GetBranchSummary,
  GetBusinessHealthSummary, GetCommissionByBranch, GetCommissionByEmployee, GetCommissionPeriodSummary,
  GetCommissionSummary, GetCustomerAnalyticsSummary, GetDashboardOverview, GetEmployeePerformanceSummary,
  GetEmployeeRanking, GetEmployeeServiceBreakdown, GetNewVsReturningCustomers, GetNoShowCancellationSummary,
  GetOutstandingPaymentSummary, GetPaymentMethodBreakdown, GetPaymentSummary, GetRefundSummary,
  GetSalesByBranch, GetSalesByEmployee, GetSalesByService, GetSalesSummary, GetSalesTrend,
  GetServicePerformanceSummary, GetServiceRevenueTrend, GetTopCustomers, GetTopServices, GetTrendSeries } from './dashboard-report.use-cases.js'

export function createDashboardReportModule(foundation: ApplicationFoundation) {
  const operations = new DashboardReportOperations({ repository: foundation.repositories.dashboardReports,
    policyEngine: foundation.policies.engine, policy: foundation.policies.dashboardReport,
    eventFactory: foundation.eventFactory, events: foundation.eventPublisher, clock: foundation.clock,
    engine: new DashboardReportEngine(), exporter: new DashboardReportExporter() })
  return {
    dashboard: { overview: new GetDashboardOverview(operations), businessHealth: new GetBusinessHealthSummary(operations),
      trends: new GetTrendSeries(operations) },
    sales: { summary: new GetSalesSummary(operations), trend: new GetSalesTrend(operations),
      byBranch: new GetSalesByBranch(operations), byService: new GetSalesByService(operations),
      byEmployee: new GetSalesByEmployee(operations) },
    bookings: { summary: new GetBookingSummary(operations), trend: new GetBookingTrend(operations),
      statusBreakdown: new GetBookingStatusBreakdown(operations),
      noShowCancellation: new GetNoShowCancellationSummary(operations) },
    payments: { summary: new GetPaymentSummary(operations), methods: new GetPaymentMethodBreakdown(operations),
      refunds: new GetRefundSummary(operations), outstanding: new GetOutstandingPaymentSummary(operations) },
    commissions: { summary: new GetCommissionSummary(operations), byEmployee: new GetCommissionByEmployee(operations),
      byBranch: new GetCommissionByBranch(operations), byPeriod: new GetCommissionPeriodSummary(operations) },
    employees: { summary: new GetEmployeePerformanceSummary(operations), ranking: new GetEmployeeRanking(operations),
      serviceBreakdown: new GetEmployeeServiceBreakdown(operations) },
    services: { summary: new GetServicePerformanceSummary(operations), top: new GetTopServices(operations),
      trend: new GetServiceRevenueTrend(operations) },
    customers: { summary: new GetCustomerAnalyticsSummary(operations),
      newVsReturning: new GetNewVsReturningCustomers(operations), top: new GetTopCustomers(operations) },
    branches: { summary: new GetBranchSummary(operations), comparison: new GetBranchComparison(operations) },
    reports: { available: new GetAvailableReports(operations), sales: new GenerateSalesReport(operations),
      bookings: new GenerateBookingReport(operations), payments: new GeneratePaymentReport(operations),
      commissions: new GenerateCommissionReport(operations), employees: new GenerateEmployeePerformanceReport(operations),
      services: new GenerateServicePerformanceReport(operations), customers: new GenerateCustomerReport(operations),
      branches: new GenerateBranchReport(operations), exportCsv: new ExportReportCsv(operations),
      exportExcel: new ExportReportExcel(operations) },
  }
}

export type DashboardReportModule = ReturnType<typeof createDashboardReportModule>
