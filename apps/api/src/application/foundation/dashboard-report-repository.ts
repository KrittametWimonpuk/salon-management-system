export type ReportBookingStatus = 'PENDING' | 'CONFIRMED' | 'CHECKED_IN' | 'IN_PROGRESS'
  | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW'
export type ReportPaymentStatus = 'PENDING' | 'PAID' | 'PARTIAL' | 'REFUNDED' | 'VOID'
export type ReportPaymentMethod = 'CASH' | 'QR' | 'CARD' | 'BANK_TRANSFER' | 'E_WALLET'
export type ReportCommissionPeriodStatus = 'OPEN' | 'APPROVED' | 'LOCKED'

export interface DashboardReportQuery {
  organizationId: string
  branchIds: readonly string[] | null
  dateFrom: Date
  dateTo: Date
  employeeId?: string
  serviceId?: string
  customerId?: string
  limit: number
}

export interface ReportBookingItemFact {
  id: string
  serviceId: string
  serviceName: string
  employeeId: string
  employeeName: string
  status: 'SCHEDULED' | 'IN_SERVICE' | 'COMPLETED' | 'CANCELLED'
  durationMinutes: number
  quantity: number
  subtotalAmount: string
  discountAmount: string
  taxAmount: string
  totalAmount: string
  included?: boolean
}

export interface ReportBookingAllocationFact {
  bookingDiscountAmount: string
  items: readonly Pick<ReportBookingItemFact, 'id' | 'serviceId' | 'serviceName' | 'subtotalAmount'
    | 'discountAmount' | 'included'>[]
}

export interface ReportPaymentFact {
  id: string
  bookingId: string
  branchId: string
  branchName: string
  customerId: string
  method: ReportPaymentMethod
  status: ReportPaymentStatus
  amount: string
  paidAt: Date | null
  voidedAt: Date | null
  refundedAmount: string
  allocation?: ReportBookingAllocationFact
}

export interface ReportRefundFact {
  id: string
  paymentId: string
  bookingId: string
  branchId: string
  branchName: string
  customerId: string
  amount: string
  createdAt: Date
  allocation: ReportBookingAllocationFact
}

export interface ReportSalesBookingFact {
  id: string
  bookingNumber: string
  branchId: string
  branchName: string
  customerId: string
  customerNumber: string
  customerName: string
  status: ReportBookingStatus
  paymentStatus: ReportPaymentStatus
  startsAt: Date
  saleClosedAt: Date
  items: readonly ReportBookingItemFact[]
  bookingDiscountAmount: string
  payments: readonly ReportPaymentFact[]
}

export interface ReportBookingFact {
  id: string
  bookingNumber: string
  branchId: string
  branchName: string
  customerId: string
  status: ReportBookingStatus
  paymentStatus: ReportPaymentStatus
  source: 'WALK_IN' | 'WEBSITE' | 'LINE' | 'FACEBOOK' | 'PHONE'
  startsAt: Date
  completedAt: Date | null
  saleClosedAt: Date | null
  items: readonly Pick<ReportBookingItemFact, 'id' | 'employeeId' | 'serviceId' | 'status' | 'durationMinutes'>[]
}

export interface ReportCommissionFact {
  id: string
  branchId: string
  branchName: string
  bookingId: string
  bookingItemId: string
  employeeId: string
  employeeName: string
  serviceId: string
  serviceName: string
  commissionAmount: string
  calculatedAt: Date
  periodStatus: ReportCommissionPeriodStatus | null
  approvalPeriods: readonly {
    periodId: string
    startsAt: Date
    endsAt: Date
    status: ReportCommissionPeriodStatus
    approvedAmount: string
  }[]
}

export interface ReportCommissionAdjustmentFact {
  id: string
  branchId: string
  branchName: string
  bookingId: string
  bookingItemId: string
  employeeId: string
  employeeName: string
  serviceId: string
  serviceName: string
  adjustmentAmount: string
  calculatedAt: Date
  periodId: string
  periodStartsAt: Date
  periodEndsAt: Date
  periodStatus: ReportCommissionPeriodStatus
}

export interface ReportCustomerFact {
  id: string
  customerNumber: string
  customerName: string
  createdAt: Date
  createdInScope: boolean
}

export interface ReportBranchFact {
  id: string
  name: string
  timezone: string
}

export interface ReportWorkingHourFact {
  branchId: string
  employeeId: string
  dayOfWeek: number
  startTime: string
  endTime: string
  effectiveFrom: string | null
  effectiveTo: string | null
}

export interface ReportTimeOffFact {
  branchId: string | null
  employeeId: string
  startsAt: Date
  endsAt: Date
}

export interface ReportHolidayFact {
  branchId: string
  startsAt: Date
  endsAt: Date
}

export interface DashboardReportSnapshot {
  sales: readonly ReportSalesBookingFact[]
  bookings: readonly ReportBookingFact[]
  payments: readonly ReportPaymentFact[]
  refunds: readonly ReportRefundFact[]
  commissions: readonly ReportCommissionFact[]
  commissionAdjustments: readonly ReportCommissionAdjustmentFact[]
  customers: readonly ReportCustomerFact[]
  branches: readonly ReportBranchFact[]
  workingHours: readonly ReportWorkingHourFact[]
  timeOffs: readonly ReportTimeOffFact[]
  holidays: readonly ReportHolidayFact[]
  truncated: boolean
}

export interface DashboardReportRepository {
  loadSnapshot(query: DashboardReportQuery): Promise<DashboardReportSnapshot>
}
