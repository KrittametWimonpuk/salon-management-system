# POS And Payment

## Scope And Decision

Phase 5 implements checkout summaries, payment collection, split tender, payment history, void, immutable partial refunds, sale close, receipt data, and payment-status reconciliation. It does not implement gateways, commission, payroll, accounting export, reports, receipt PDF, printer integration, notifications, or UI.

The approved additive migration adds aggregate `Booking.paymentStatus`, `saleClosedAt`, and `closedByUserId`; Payment void metadata; and the immutable `PaymentRefund` ledger. Existing architecture and authentication/RBAC mechanisms remain unchanged.

## Use Cases

- Checkout: `GetCheckoutSummary`, `ValidateCheckout`, `CloseSale`.
- Payment: `CreatePayment`, `CreateSplitPayment`, `GetPayment`, `GetBookingPayments`, `GetPaymentList`, `VoidPayment`, `RefundPayment`.
- Receipt and reconciliation: `GetReceiptData`, `RecalculateBookingPaymentStatus`.

All use cases use `PaymentRepository`. Financial writes run in `TransactionManager.withTransaction()` and expected business failures use `Result<T, DomainError>`.

## Checkout Flow

1. Load the booking through organization and resolved-branch predicates.
2. Select non-cancelled BookingItems, immutable BookingDiscount rows, and payment/refund history.
3. Calculate subtotal, discount, tax, grand total, net paid, remaining, and aggregate status using integer cents.
4. Validate that the booking is `COMPLETED`, has at least one payable item, and contains internally consistent history.
5. Compare calculated status with persisted `Booking.paymentStatus` during explicit validation.
6. Close the sale only when remaining is zero, aggregate status is `PAID`, and it has not already been closed.

`CHECKED_IN` and `IN_PROGRESS` bookings cannot accept payment in Phase 5. This is the conservative approved policy; no configuration fallback is implied.

## Payment And Split Flow

A payment has an immutable amount, organization currency, tender method, cashier, optional reference, optional namespaced idempotency key, paid timestamp, and notes. Payments created in this offline POS phase immediately use `PAID`; there is no asynchronous gateway-pending flow.

Multiple payments may settle one booking. Split payment accepts two through ten tender lines and creates all lines in one transaction. The combined amount may not exceed remaining balance. If net paid is below total the Booking status is `PARTIAL`; exact settlement changes it to `PAID`. Default overpayment is disabled.

Payment-level `PARTIAL` means that payment has been partially refunded. Booking-level `PARTIAL` means the sale has a positive balance collected but is not currently fully settled.

## Void And Refund

- Void requires a reason, applies only to a `PAID` payment with no refunds, and is forbidden after sale close.
- Void retains the original row, records `voidedAt`/`voidReason`, changes it to `VOID`, and removes its amount from net paid.
- Refund requires a positive amount and reason and may include a reference and notes.
- Refund is forbidden for voided or fully refunded payments and cannot exceed the payment's current net amount.
- Each refund is a new immutable `PaymentRefund` row. Multiple partial refunds are supported; the original Payment amount is never edited.
- Partial refund changes Payment to `PARTIAL`; full refund changes it to `REFUNDED`. Booking aggregate status is recalculated in the same transaction.
- Refund after sale close is allowed and updates aggregate payment status, while `saleClosedAt` remains an immutable record that the sale had been closed.

## Snapshot And Tax Strategy

Checkout never reads Service or BranchService prices. It sums active BookingItem `subtotalAmount`, `discountAmount`, `taxAmount`, and `totalAmount`, then subtracts immutable BookingDiscount amounts. Discount snapshots are not recalculated from current promotions.

Tax summary groups BookingItems by `taxType`, `taxMode`, and `taxRate`. `NONE`, `VAT/INCLUDED`, and `VAT/EXCLUDED` values come directly from item snapshots. Every money operation converts decimal strings to integer cents; floating point is not used. Inconsistent, negative, overpaid, over-refunded, or excessive-discount history returns a financial-integrity failure.

## Financial Integrity And Concurrency

Serializable transactions are combined with sorted PostgreSQL transaction advisory locks namespaced by organization. Booking writes lock `booking:{id}`; void/refund also lock `payment:{id}`. State is loaded again after lock acquisition, preventing concurrent payments from both spending the same remaining balance.

Create, split, void, refund, close, and explicit recalculation update aggregate Booking status inside the same transaction. Post-write reconciliation failures are treated as unexpected technical failures so PostgreSQL rolls the complete transaction back; expected failures are checked before any write.

## API And Policy

All endpoints require authentication, resolved branch context, permission middleware, Zod validation where applicable, application policy evaluation, shared Result-to-HTTP mapping, and the existing audit pipeline. Routes are documented in `docs/API.md`.

Permissions: `payment.create`, `payment.read`, `payment.void`, `payment.refund`, `payment.checkout`, `payment.close_sale`, `pos.read`, and `pos.manage`. Permission provisioning remains an operational requirement because the project has no seed/onboarding mechanism.

## Events

After transaction commit, the in-process dispatcher publishes `CheckoutValidated`, `SaleClosed`, `PaymentCreated`, `SplitPaymentCreated`, `PaymentVoided`, `PaymentRefunded`, `BookingPaymentStatusChanged`, and `ReceiptDataGenerated`. No queue, webhook, worker, or external delivery is introduced.

Audit actions are `checkout.validated`, `sale.closed`, `payment.created`, `payment.split_created`, `payment.voided`, `payment.refunded`, and `receipt.generated`. Use cases never write AuditLog directly.

## Error Cases

Expected failures cover missing or inaccessible booking/payment, branch or tenant isolation, permission denial, non-completed or empty booking, invalid amount/currency, overpayment, duplicate or mismatched idempotency data, premature/duplicate close, invalid void state, invalid/excessive refund, calculated/persisted checkout mismatch, and serializable concurrency conflict.

## Known Limitations

- Receipt reference is the immutable booking number; there is no separate receipt sequence.
- No cash-change/overpayment workflow is provided. Payments must equal or stay below remaining amount.
- Split retries require new or unique per-line idempotency keys; there is no batch-level idempotency record.
- Refund requests have no dedicated idempotency key; operators should provide a stable external reference and verify history before retrying.
- No gateway authorization/capture/reversal, chargeback, cash drawer, shift/session close, fiscal receipt, or accounting journal is included.
- Permission keys must be provisioned operationally before enabling routes.
