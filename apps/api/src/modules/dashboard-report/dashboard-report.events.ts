export const DashboardReportEventName = {
  DASHBOARD_VIEWED: 'DashboardViewed',
  REPORT_GENERATED: 'ReportGenerated',
  REPORT_EXPORTED: 'ReportExported',
  SALES_SUMMARY_GENERATED: 'SalesSummaryGenerated',
  BOOKING_SUMMARY_GENERATED: 'BookingSummaryGenerated',
  PAYMENT_SUMMARY_GENERATED: 'PaymentSummaryGenerated',
  COMMISSION_SUMMARY_GENERATED: 'CommissionSummaryGenerated',
  EMPLOYEE_PERFORMANCE_GENERATED: 'EmployeePerformanceGenerated',
  SERVICE_PERFORMANCE_GENERATED: 'ServicePerformanceGenerated',
  CUSTOMER_ANALYTICS_GENERATED: 'CustomerAnalyticsGenerated',
  BRANCH_SUMMARY_GENERATED: 'BranchSummaryGenerated',
} as const

export type DashboardReportEventNameValue = (typeof DashboardReportEventName)[keyof typeof DashboardReportEventName]
