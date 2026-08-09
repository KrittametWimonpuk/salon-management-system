import { describe, expect, it } from 'vitest'
import { FixedClock } from '../../src/infrastructure/foundation/system-adapters.js'

describe('Clock', () => {
  it('returns defensive copies and a UTC calendar date', () => {
    const clock = new FixedClock(new Date('2026-08-08T10:20:30.000Z'))
    const first = clock.now()
    first.setUTCFullYear(2000)

    expect(clock.now().toISOString()).toBe('2026-08-08T10:20:30.000Z')
    expect(clock.utc().toISOString()).toBe('2026-08-08T10:20:30.000Z')
    expect(clock.today()).toBe('2026-08-08')
  })
})
