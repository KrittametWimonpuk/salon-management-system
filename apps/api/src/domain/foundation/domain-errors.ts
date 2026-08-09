export type DomainErrorCode =
  | 'VALIDATION'
  | 'CONFLICT'
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'BUSINESS_RULE_VIOLATION'
  | 'CONCURRENCY'
  | 'TENANT_ISOLATION'

export interface DomainError {
  readonly code: DomainErrorCode
  readonly message: string
  readonly details: Readonly<Record<string, unknown>>
}

abstract class DomainFailure implements DomainError {
  abstract readonly code: DomainErrorCode

  constructor(
    readonly message: string,
    readonly details: Readonly<Record<string, unknown>> = {},
  ) {}
}

export class ValidationError extends DomainFailure {
  readonly code = 'VALIDATION' as const
}

export class ConflictError extends DomainFailure {
  readonly code = 'CONFLICT' as const
}

export class NotFoundError extends DomainFailure {
  readonly code = 'NOT_FOUND' as const
}

export class ForbiddenError extends DomainFailure {
  readonly code = 'FORBIDDEN' as const
}

export class BusinessRuleViolationError extends DomainFailure {
  readonly code = 'BUSINESS_RULE_VIOLATION' as const
}

export class ConcurrencyError extends DomainFailure {
  readonly code = 'CONCURRENCY' as const
}

export class TenantIsolationError extends DomainFailure {
  readonly code = 'TENANT_ISOLATION' as const
}

export class BookingConflictError extends ConflictError {}
export class InvalidBookingStatusTransitionError extends BusinessRuleViolationError {}
export class EmployeeUnavailableError extends BusinessRuleViolationError {}
export class ServiceUnavailableAtBranchError extends BusinessRuleViolationError {}
export class EmployeeSkillMismatchError extends BusinessRuleViolationError {}
export class WorkingHourViolationError extends BusinessRuleViolationError {}
export class TimeOffConflictError extends BusinessRuleViolationError {}
export class BookingNotFoundError extends NotFoundError {}
export class PaymentAmountInvalidError extends BusinessRuleViolationError {}
export class PaymentExceedsRemainingAmountError extends ConflictError {}
export class PaymentNotFoundError extends NotFoundError {}
export class PaymentAlreadyVoidedError extends ConflictError {}
export class PaymentAlreadyRefundedError extends ConflictError {}
export class RefundAmountInvalidError extends BusinessRuleViolationError {}
export class BookingNotPayableError extends BusinessRuleViolationError {}
export class CheckoutMismatchError extends ConflictError {}
export class FinancialIntegrityError extends BusinessRuleViolationError {}
export class InvalidPaymentStatusError extends BusinessRuleViolationError {}
export class CommissionRuleNotFoundError extends BusinessRuleViolationError {}
export class CommissionAlreadyCalculatedError extends ConflictError {}
export class CommissionPeriodLockedError extends ConflictError {}
export class CommissionCalculationNotAllowedError extends BusinessRuleViolationError {}
export class CommissionBaseAmountInvalidError extends BusinessRuleViolationError {}
export class CommissionTierNotFoundError extends BusinessRuleViolationError {}
export class CommissionAdjustmentInvalidError extends BusinessRuleViolationError {}
export class CommissionDuplicateError extends ConflictError {}
export class CommissionFinancialIntegrityError extends BusinessRuleViolationError {}
export class CommissionApprovalInvalidError extends BusinessRuleViolationError {}
export class ReportDateRangeInvalidError extends ValidationError {}
export class ReportDateRangeTooLargeError extends BusinessRuleViolationError {}
export class ReportRowLimitExceededError extends BusinessRuleViolationError {}
export class ReportDataIntegrityError extends BusinessRuleViolationError {}
