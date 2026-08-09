import { describe, expect, it } from 'vitest'
import type { BookingAvailabilityData } from '../../src/application/foundation/repositories.js'
import { BookingAvailabilityEngine, zonedDateTimeToUtc } from '../../src/modules/booking/booking.engine.js'
import { validateBookingTransition } from '../../src/modules/booking/booking.state-machine.js'

const serviceId = '10000000-0000-4000-8000-000000000001'
const employeeId = '20000000-0000-4000-8000-000000000001'
const skillId = '30000000-0000-4000-8000-000000000001'
const start = zonedDateTimeToUtc('2026-08-10', '09:00:00', 'Asia/Bangkok')

function data(overrides: Partial<BookingAvailabilityData> = {}): BookingAvailabilityData {
  return { branchId: 'branch', branchName: 'Main', timezone: 'Asia/Bangkok', slotIntervalMinutes: 15,
    services: [{ id: serviceId, name: 'Hair Color', durationMinutes: 60, effectivePrice: '100.00',
      taxType: 'VAT', taxMode: 'INCLUDED', taxRate: '7.00', requiredSkills: [{ skillId, requiredLevel: 3 }] }],
    employees: [{ id: employeeId, displayName: 'May', skills: [{ skillId, proficiencyLevel: 4 }],
      workingHours: [{ dayOfWeek: 1, startTime: '09:00:00', endTime: '18:00:00',
        effectiveFrom: null, effectiveTo: null }], timeOffs: [], blocks: [] }], holidays: [], ...overrides }
}

describe('Booking availability engine', () => {
  const engine = new BookingAvailabilityEngine()

  it('plans an available item and snapshots included VAT with integer rounding', () => {
    const plan = engine.planAt(data(), [{ serviceId, employeeId }], start)
    expect(plan).toMatchObject({ ok: true, value: { durationMinutes: 60, effectivePrice: '100.00',
      items: [{ employee: { id: employeeId } }] } })
    if (!plan.ok) return
    expect(engine.snapshots(plan.value, { generate: () => 'item' })[0]).toMatchObject({ unitPrice: '100.00',
      subtotalAmount: '100.00', taxAmount: '6.54', totalAmount: '100.00' })
  })

  it('calculates excluded VAT and total', () => {
    const value = data({ services: [{ ...data().services[0]!, taxMode: 'EXCLUDED' }] })
    const plan = engine.planAt(value, [{ serviceId }], start); if (!plan.ok) return
    expect(engine.snapshots(plan.value, { generate: () => 'item' })[0])
      .toMatchObject({ taxAmount: '7.00', totalAmount: '107.00' })
  })

  it('rejects missing service, skill mismatch, working-hour, time-off, and booking conflicts', () => {
    expect(engine.planAt(data(), [{ serviceId: 'missing' }], start)).toMatchObject({ ok: false,
      error: { code: 'BUSINESS_RULE_VIOLATION' } })
    expect(engine.planAt(data({ employees: [{ ...data().employees[0]!, skills: [] }] }), [{ serviceId }], start))
      .toMatchObject({ ok: false, error: { message: 'No employee has all required skills' } })
    expect(engine.planAt(data(), [{ serviceId }], zonedDateTimeToUtc('2026-08-10', '08:00:00', 'Asia/Bangkok')))
      .toMatchObject({ ok: false, error: { message: 'Booking is outside employee working hours' } })
    const end = new Date(start.getTime() + 60 * 60_000)
    expect(engine.planAt(data({ employees: [{ ...data().employees[0]!, timeOffs: [{ startsAt: start, endsAt: end }] }] }),
      [{ serviceId }], start)).toMatchObject({ ok: false, error: { message: 'Employee has overlapping time off' } })
    expect(engine.planAt(data({ employees: [{ ...data().employees[0]!, blocks: [{ bookingId: 'other',
      startsAt: start, endsAt: end }] }] }), [{ serviceId }], start))
      .toMatchObject({ ok: false, error: { message: 'Employee has an overlapping booking' } })
  })

  it('returns slots and effective data for availability requests', () => {
    expect(engine.availability(data(), [{ serviceId }], '2026-08-10', '09:00:00'))
      .toMatchObject({ ok: true, value: { available: true, computedDurationMinutes: 60,
        effectivePrice: '100.00', availableEmployees: [{ id: employeeId }] } })
  })

  it('enforces the configured slot interval and booking state machine', () => {
    expect(engine.planAt(data(), [{ serviceId }], zonedDateTimeToUtc('2026-08-10', '09:07:00', 'Asia/Bangkok')))
      .toMatchObject({ ok: false, error: { code: 'BUSINESS_RULE_VIOLATION' } })
    expect(validateBookingTransition('PENDING', 'CONFIRMED').ok).toBe(true)
    expect(validateBookingTransition('COMPLETED', 'CANCELLED'))
      .toMatchObject({ ok: false, error: { code: 'BUSINESS_RULE_VIOLATION' } })
  })
})
