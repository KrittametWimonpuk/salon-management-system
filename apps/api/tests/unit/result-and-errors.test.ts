import { describe, expect, it } from 'vitest'
import {
  BusinessRuleViolationError,
  ConcurrencyError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  TenantIsolationError,
  ValidationError,
} from '../../src/domain/foundation/domain-errors.js'
import { failure, flatMapResult, mapResult, success } from '../../src/domain/foundation/result.js'

describe('Result and domain errors', () => {
  it('maps and chains successful values without exceptions', () => {
    const mapped = mapResult(success(2), (value) => value * 3)
    const chained = flatMapResult(mapped, (value) => success(String(value)))

    expect(chained).toEqual({ ok: true, value: '6' })
  })

  it('preserves failures through a chain', () => {
    const error = new ConflictError('duplicate')
    const result = flatMapResult(failure(error), () => success('unreachable'))

    expect(result).toEqual({ ok: false, error })
  })

  it.each([
    [new ValidationError('invalid'), 'VALIDATION'],
    [new ConflictError('conflict'), 'CONFLICT'],
    [new NotFoundError('missing'), 'NOT_FOUND'],
    [new ForbiddenError('denied'), 'FORBIDDEN'],
    [new BusinessRuleViolationError('rule'), 'BUSINESS_RULE_VIOLATION'],
    [new ConcurrencyError('race'), 'CONCURRENCY'],
    [new TenantIsolationError('tenant'), 'TENANT_ISOLATION'],
  ])('exposes a stable code for %s', (error, code) => {
    expect(error).toMatchObject({ code, details: {} })
    expect(error).not.toBeInstanceOf(Error)
  })
})

