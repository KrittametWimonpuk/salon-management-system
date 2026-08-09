import type { ApplicationFoundation } from '../../composition-root.js'
import { PaymentFinancialEngine } from './payment.engine.js'
import { CloseSale, CreatePayment, CreateSplitPayment, GetBookingPayments, GetCheckoutSummary, GetPayment,
  GetPaymentList, GetReceiptData, PaymentOperations, RecalculateBookingPaymentStatus, RefundPayment,
  ValidateCheckout, VoidPayment } from './payment.use-cases.js'

export function createPaymentModule(foundation: ApplicationFoundation) {
  const operations = new PaymentOperations({ repository: foundation.repositories.payments,
    transactions: foundation.transactionManager, policyEngine: foundation.policies.engine,
    policy: foundation.policies.payment, eventFactory: foundation.eventFactory, events: foundation.eventPublisher,
    clock: foundation.clock, ids: foundation.ids, financials: new PaymentFinancialEngine() })
  return { checkout: new GetCheckoutSummary(operations), validate: new ValidateCheckout(operations),
    closeSale: new CloseSale(operations), create: new CreatePayment(operations), split: new CreateSplitPayment(operations),
    get: new GetPayment(operations), bookingPayments: new GetBookingPayments(operations),
    list: new GetPaymentList(operations), void: new VoidPayment(operations), refund: new RefundPayment(operations),
    receipt: new GetReceiptData(operations), recalculate: new RecalculateBookingPaymentStatus(operations) }
}

export type PaymentModule = ReturnType<typeof createPaymentModule>
