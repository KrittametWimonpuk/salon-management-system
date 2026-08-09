import { ValidationError } from './domain-errors.js'
import { failure, success, type Result } from './result.js'

export interface QuerySpecification<TCriteria> {
  toCriteria(): Readonly<TCriteria>
}

export interface CustomerActiveCriteria {
  includeDeleted: false
}

export class CustomerActiveSpecification implements QuerySpecification<CustomerActiveCriteria> {
  toCriteria(): Readonly<CustomerActiveCriteria> {
    return { includeDeleted: false }
  }
}

export interface EmployeeAvailableCriteria {
  organizationId: string
  branchId: string
  employeeId: string
  startsAt: Date
  endsAt: Date
}

export class EmployeeAvailableSpecification implements QuerySpecification<EmployeeAvailableCriteria> {
  private constructor(private readonly criteria: EmployeeAvailableCriteria) {}

  static create(criteria: EmployeeAvailableCriteria): Result<EmployeeAvailableSpecification, ValidationError> {
    if (criteria.startsAt.getTime() >= criteria.endsAt.getTime()) {
      return failure(new ValidationError('Availability period must end after it starts'))
    }
    return success(new EmployeeAvailableSpecification(criteria))
  }

  toCriteria(): Readonly<EmployeeAvailableCriteria> {
    return { ...this.criteria }
  }
}

export interface BookingOverlapCriteria {
  branchId: string
  employeeId: string
  startsAt: Date
  endsAt: Date
  excludeBookingId?: string
}

export class BookingOverlapSpecification implements QuerySpecification<BookingOverlapCriteria> {
  private constructor(private readonly criteria: BookingOverlapCriteria) {}

  static create(criteria: BookingOverlapCriteria): Result<BookingOverlapSpecification, ValidationError> {
    if (criteria.startsAt.getTime() >= criteria.endsAt.getTime()) {
      return failure(new ValidationError('Overlap period must end after it starts'))
    }
    return success(new BookingOverlapSpecification(criteria))
  }

  toCriteria(): Readonly<BookingOverlapCriteria> {
    return { ...this.criteria }
  }
}

