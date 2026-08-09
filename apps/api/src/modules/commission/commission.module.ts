import type { ApplicationFoundation } from '../../composition-root.js'
import { PaymentFinancialEngine } from '../pos-payment/payment.engine.js'
import { CommissionFinancialEngine } from './commission.engine.js'
import { ApplyRefundCommissionAdjustment, ApproveCommission, CalculateBookingCommission,
  CalculateCommissionPeriod, CalculateEmployeeCommission, CommissionOperations, GetBookingCommissionHistory,
  GetBranchCommissionSummary, GetCommissionHistory, GetCommissionList, GetCommissionPeriodStatus,
  GetEmployeeCommissionHistory, GetEmployeeCommissionSummary, LockCommissionPeriod, PreviewBookingCommission,
  PreviewCommissionPeriod, PreviewEmployeeCommission, RecalculateBookingCommission } from './commission.use-cases.js'

export function createCommissionModule(foundation: ApplicationFoundation) {
  const operations = new CommissionOperations({ repository: foundation.repositories.commissions,
    payments: foundation.repositories.payments, transactions: foundation.transactionManager,
    policyEngine: foundation.policies.engine, policy: foundation.policies.commission,
    eventFactory: foundation.eventFactory, events: foundation.eventPublisher, clock: foundation.clock,
    ids: foundation.ids, engine: new CommissionFinancialEngine(), paymentFinancials: new PaymentFinancialEngine() })
  return { previewBooking: new PreviewBookingCommission(operations), previewEmployee: new PreviewEmployeeCommission(operations),
    previewPeriod: new PreviewCommissionPeriod(operations), calculateBooking: new CalculateBookingCommission(operations),
    calculateEmployee: new CalculateEmployeeCommission(operations), calculatePeriod: new CalculateCommissionPeriod(operations),
    get: new GetCommissionHistory(operations), list: new GetCommissionList(operations),
    bookingHistory: new GetBookingCommissionHistory(operations), employeeHistory: new GetEmployeeCommissionHistory(operations),
    recalculate: new RecalculateBookingCommission(operations), adjustRefund: new ApplyRefundCommissionAdjustment(operations),
    approve: new ApproveCommission(operations), lockPeriod: new LockCommissionPeriod(operations),
    periodStatus: new GetCommissionPeriodStatus(operations), summary: new GetBranchCommissionSummary(operations),
    employeeSummary: new GetEmployeeCommissionSummary(operations) }
}
export type CommissionModule = ReturnType<typeof createCommissionModule>
