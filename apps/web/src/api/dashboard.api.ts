import { apiRequest } from './client'
import type {
  BookingStatusBreakdown,
  BookingSummary,
  BranchSummary,
  CommissionByEmployee,
  CommissionSummary,
  CustomerAnalytics,
  DashboardFilters,
  DashboardOverview,
  EmployeePerformance,
  PaymentMethodBreakdown,
  PaymentSummary,
  SalesSummary,
  ServicePerformance,
  TrendPoint,
} from '../features/dashboard/dashboard.types'

function query(filters: DashboardFilters): string {
  const values = new URLSearchParams({
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    timezone: filters.timezone,
    granularity: filters.granularity,
  })
  if (filters.branchId) values.set('branchId', filters.branchId)
  if (filters.employeeId) values.set('employeeId', filters.employeeId)
  if (filters.serviceId) values.set('serviceId', filters.serviceId)
  if (filters.customerId) values.set('customerId', filters.customerId)
  return values.toString()
}

function get<T>(path: string, filters: DashboardFilters, signal?: AbortSignal): Promise<T> {
  return apiRequest<T>(`${path}?${query(filters)}`, {
    branch: filters.branchId !== null,
    notifyForbidden: false,
    ...(signal ? { signal } : {}),
  })
}

export const dashboardApi = {
  overview: (filters: DashboardFilters, signal?: AbortSignal) => get<DashboardOverview>('/dashboard/overview', filters, signal),
  trends: (filters: DashboardFilters, signal?: AbortSignal) => get<readonly TrendPoint[]>('/dashboard/trends', filters, signal),
  sales: (filters: DashboardFilters, signal?: AbortSignal) => get<SalesSummary>('/dashboard/sales', filters, signal),
  salesTrend: (filters: DashboardFilters, signal?: AbortSignal) => get<readonly TrendPoint[]>('/dashboard/sales/trend', filters, signal),
  bookings: (filters: DashboardFilters, signal?: AbortSignal) => get<BookingSummary>('/dashboard/bookings', filters, signal),
  bookingStatuses: (filters: DashboardFilters, signal?: AbortSignal) => get<readonly BookingStatusBreakdown[]>('/dashboard/bookings/status-breakdown', filters, signal),
  payments: (filters: DashboardFilters, signal?: AbortSignal) => get<PaymentSummary>('/dashboard/payments', filters, signal),
  paymentMethods: (filters: DashboardFilters, signal?: AbortSignal) => get<readonly PaymentMethodBreakdown[]>('/dashboard/payments/method-breakdown', filters, signal),
  commissions: (filters: DashboardFilters, signal?: AbortSignal) => get<CommissionSummary>('/dashboard/commissions', filters, signal),
  commissionsByEmployee: (filters: DashboardFilters, signal?: AbortSignal) => get<readonly CommissionByEmployee[]>('/dashboard/commissions/by-employee', filters, signal),
  employees: (filters: DashboardFilters, signal?: AbortSignal) => get<readonly EmployeePerformance[]>('/dashboard/employees/performance', filters, signal),
  services: (filters: DashboardFilters, signal?: AbortSignal) => get<readonly ServicePerformance[]>('/dashboard/services/performance', filters, signal),
  customers: (filters: DashboardFilters, signal?: AbortSignal) => get<CustomerAnalytics>('/dashboard/customers/analytics', filters, signal),
  branches: (filters: DashboardFilters, signal?: AbortSignal) => get<readonly BranchSummary[]>('/dashboard/branches/summary', filters, signal),
}
