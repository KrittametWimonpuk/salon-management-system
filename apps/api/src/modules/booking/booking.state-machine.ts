import type { BookingStatusValue } from '../../application/foundation/repositories.js'
import { InvalidBookingStatusTransitionError, type DomainError } from '../../domain/foundation/domain-errors.js'
import { failure, success, type Result } from '../../domain/foundation/result.js'

const transitions: Readonly<Record<BookingStatusValue, readonly BookingStatusValue[]>> = {
  PENDING: ['CONFIRMED', 'CANCELLED'], CONFIRMED: ['CHECKED_IN', 'CANCELLED', 'NO_SHOW'],
  CHECKED_IN: ['IN_PROGRESS', 'CANCELLED'], IN_PROGRESS: ['COMPLETED'], COMPLETED: [], CANCELLED: [], NO_SHOW: [],
}

export function validateBookingTransition(from: BookingStatusValue,
  to: BookingStatusValue): Result<void, DomainError> {
  return transitions[from].includes(to) ? success(undefined)
    : failure(new InvalidBookingStatusTransitionError(`Booking cannot transition from ${from} to ${to}`,
      { from, to }))
}
