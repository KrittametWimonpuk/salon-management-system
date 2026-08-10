export const DASHBOARD_TIMEZONE = 'Asia/Bangkok'

export type Granularity = 'daily' | 'weekly' | 'monthly' | 'custom'

export interface DashboardFilters {
  dateFrom: string
  dateTo: string
  timezone: string
  granularity: Granularity
  branchId: string | null
  employeeId?: string
  serviceId?: string
  customerId?: string
}

export interface DashboardOverview {
  totalBookings: number
  completedBookings: number
  cancelledBookings: number
  noShowBookings: number
  totalCustomers: number
  newCustomers: number
  returningCustomers: number
  grossSales: number
  discountTotal: number
  taxTotal: number
  netSales: number
  paidAmount: number
  refundedAmount: number
  voidedAmount: number
  outstandingAmount: number
  commissionTotal: number
  commissionAdjustmentTotal: number
  averageTicketSize: number
  averageSpendPerCustomer: number
  topService: string | null
  topEmployee: string | null
  topBranch: string | null
  timezone: string
  dateFrom: string
  dateTo: string
}

export interface SalesSummary {
  grossSales: number
  discountTotal: number
  taxTotal: number
  netSales: number
  paidAmount: number
  refundedAmount: number
  voidedAmount: number
  outstandingAmount: number
  commissionTotal: number
  commissionAdjustmentTotal: number
  bookingCount: number
  averageTicketSize: number
  refundRateBps: number
}

export interface TrendPoint {
  date: string
  grossSales?: number
  netSales?: number
  paidAmount?: number
  refundedAmount?: number
  outstandingAmount?: number
  bookings?: number
  completed?: number
  totalBookings?: number
  completedBookings?: number
  cancelledBookings?: number
  noShowBookings?: number
}

export interface BookingSummary {
  totalBookings: number
  completedBookings: number
  cancelledBookings: number
  noShowBookings: number
  completedRateBps: number
  cancellationRateBps: number
  noShowRateBps: number
  employeeUtilizationRateBps: number
}

export interface BookingStatusBreakdown {
  status: string
  count: number
}

export interface PaymentSummary {
  paidAmount: number
  partialAmount: number
  outstandingAmount: number
  refundedAmount: number
  voidedAmount: number
  netPaidAmount: number
}

export interface PaymentMethodBreakdown {
  method: string
  paymentCount: number
  paidAmount: number
}

export interface CommissionSummary {
  commissionTotal: number
  baseCommissionTotal: number
  commissionAdjustmentTotal: number
  approvedCommissionTotal: number
  lockedCommissionTotal: number
}

export interface CommissionByEmployee {
  id: string
  name: string
  baseCommissionTotal: number
  commissionAdjustmentTotal: number
  commissionTotal: number
}

export interface EmployeePerformance {
  employeeId: string
  employeeName: string
  revenue: number
  bookingCount: number
  serviceCount: number
  commissionTotal: number
  averageTicket: number
  completedServiceMinutes: number
  scheduledWorkingMinutes: number
  utilizationRateBps: number
}

export interface ServicePerformance {
  serviceId: string
  serviceName: string
  revenue: number
  serviceCount: number
  refundImpact: number
  averagePrice: number
}

export interface CustomerAnalytics {
  totalCustomers: number
  newCustomers: number
  returningCustomers: number
  averageSpendPerCustomer: number
}

export interface BranchSummary {
  branchId: string
  branchName: string
  netSales: number
  bookingCount: number
  paidAmount: number
  refundedAmount: number
  commissionTotal: number
}

export interface AsyncData<T> {
  data: T | null
  error: Error | null
  status: 'idle' | 'loading' | 'success' | 'error'
  reload: () => void
}
