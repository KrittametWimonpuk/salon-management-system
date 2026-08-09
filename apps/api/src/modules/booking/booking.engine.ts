import type { BookingAvailabilityData, BookingItemSnapshotData, BookableServiceRecord,
  BookingEmployeeRecord } from '../../application/foundation/repositories.js'
import { BusinessRuleViolationError, EmployeeSkillMismatchError, EmployeeUnavailableError,
  ServiceUnavailableAtBranchError, TimeOffConflictError, WorkingHourViolationError,
  type DomainError } from '../../domain/foundation/domain-errors.js'
import type { IdGenerator } from '../../domain/foundation/id-generator.js'
import { failure, success, type Result } from '../../domain/foundation/result.js'

export interface ScheduleRequestItem { serviceId: string; employeeId?: string; durationMinutes?: number; notes?: string | null }
export interface PlannedItem { service: BookableServiceRecord; employee: BookingEmployeeRecord; startsAt: Date; endsAt: Date;
  durationMinutes: number; notes: string | null }
export interface SchedulePlan { startsAt: Date; endsAt: Date; durationMinutes: number; effectivePrice: string;
  items: readonly PlannedItem[] }
export interface AvailabilityResult { available: boolean; availableEmployees: readonly { id: string; displayName: string }[];
  availableTimeSlots: readonly { startsAt: Date; endsAt: Date; employeeIds: readonly string[] }[];
  unavailableReasons: readonly string[]; computedDurationMinutes: number; effectivePrice: string }

export class BookingAvailabilityEngine {
  planAt(data: BookingAvailabilityData, requests: readonly ScheduleRequestItem[], startsAt: Date): Result<SchedulePlan, DomainError> {
    if (!Number.isInteger(data.slotIntervalMinutes) || !data.slotIntervalMinutes
      || data.slotIntervalMinutes < 5 || data.slotIntervalMinutes > 60) {
      return failure(new BusinessRuleViolationError('booking.slot_interval_minutes must be configured from 5 to 60'))
    }
    const local = zonedParts(startsAt, data.timezone)
    if ((local.hour * 60 + local.minute) % data.slotIntervalMinutes !== 0 || local.second !== 0) {
      return failure(new BusinessRuleViolationError('Booking start must align with the configured slot interval'))
    }
    const services = new Map(data.services.map((service) => [service.id, service]))
    const planned: PlannedItem[] = []
    let cursor = startsAt
    for (const request of requests) {
      const service = services.get(request.serviceId)
      if (!service) return failure(new ServiceUnavailableAtBranchError('Service is not active at this branch',
        { serviceId: request.serviceId }))
      const durationMinutes = request.durationMinutes ?? service.durationMinutes
      const endsAt = new Date(cursor.getTime() + durationMinutes * 60_000)
      const candidates = data.employees.filter((employee) => !request.employeeId || employee.id === request.employeeId)
        .filter((employee) => hasSkills(employee, service)).sort((left, right) => left.blocks.length - right.blocks.length
          || left.id.localeCompare(right.id))
      if (!candidates.length) return failure(new EmployeeSkillMismatchError('No employee has all required skills',
        { serviceId: service.id, employeeId: request.employeeId }))
      const employee = candidates.find((candidate) => isEmployeeAvailable(candidate, cursor, endsAt, data))
      if (!employee) return failure(classifyUnavailable(candidates[0]!, cursor, endsAt, data))
      planned.push({ service, employee, startsAt: cursor, endsAt, durationMinutes, notes: request.notes ?? null })
      cursor = endsAt
    }
    return success({ startsAt, endsAt: cursor, durationMinutes: Math.round((cursor.getTime() - startsAt.getTime()) / 60_000),
      effectivePrice: centsToMoney(planned.reduce((sum, item) => sum + moneyToCents(item.service.effectivePrice), 0n)),
      items: planned })
  }

  availability(data: BookingAvailabilityData, requests: readonly ScheduleRequestItem[], date: string,
    startTime?: string): Result<AvailabilityResult, DomainError> {
    if (!data.slotIntervalMinutes || data.slotIntervalMinutes < 5 || data.slotIntervalMinutes > 60) {
      return failure(new BusinessRuleViolationError('booking.slot_interval_minutes must be configured from 5 to 60'))
    }
    const duration = requests.reduce((sum, request) => sum + (request.durationMinutes
      ?? data.services.find((service) => service.id === request.serviceId)?.durationMinutes ?? 0), 0)
    const price = centsToMoney(requests.reduce((sum, request) => sum
      + moneyToCents(data.services.find((service) => service.id === request.serviceId)?.effectivePrice ?? '0'), 0n))
    let candidates: Date[]
    try { candidates = startTime ? [zonedDateTimeToUtc(date, startTime, data.timezone)]
      : slotStarts(date, data.timezone, data.slotIntervalMinutes) }
    catch { return failure(new BusinessRuleViolationError('Requested local time does not exist in branch timezone')) }
    const slots: { startsAt: Date; endsAt: Date; employeeIds: readonly string[] }[] = []
    const reasons = new Set<string>()
    for (const start of candidates) {
      const result = this.planAt(data, requests, start)
      if (result.ok) slots.push({ startsAt: start, endsAt: result.value.endsAt,
        employeeIds: [...new Set(result.value.items.map((item) => item.employee.id))] })
      else reasons.add(result.error.message)
    }
    const employeeIds = new Set(slots.flatMap((slot) => slot.employeeIds))
    const availableEmployees = data.employees.filter((employee) => employeeIds.has(employee.id))
      .map(({ id, displayName }) => ({ id, displayName }))
    return success({ available: slots.length > 0, availableEmployees, availableTimeSlots: slots,
      unavailableReasons: slots.length ? [] : [...reasons], computedDurationMinutes: duration, effectivePrice: price })
  }

  snapshots(plan: SchedulePlan, ids: IdGenerator): readonly BookingItemSnapshotData[] {
    return plan.items.map((item) => snapshot(item, ids.generate()))
  }
}

function hasSkills(employee: BookingEmployeeRecord, service: BookableServiceRecord): boolean {
  return service.requiredSkills.every((required) => employee.skills.some((skill) => skill.skillId === required.skillId
    && (required.requiredLevel === null || (skill.proficiencyLevel ?? 0) >= required.requiredLevel)))
}

function isEmployeeAvailable(employee: BookingEmployeeRecord, startsAt: Date, endsAt: Date,
  data: BookingAvailabilityData): boolean {
  const start = zonedParts(startsAt, data.timezone); const end = zonedParts(endsAt, data.timezone)
  if (start.date !== end.date) return false
  const inHours = employee.workingHours.some((hour) => hour.dayOfWeek === start.dayOfWeek
    && (!hour.effectiveFrom || hour.effectiveFrom <= start.date) && (!hour.effectiveTo || hour.effectiveTo >= start.date)
    && hour.startTime <= start.time && hour.endTime >= end.time)
  return inHours && !employee.timeOffs.some((item) => overlaps(startsAt, endsAt, item.startsAt, item.endsAt))
    && !employee.blocks.some((item) => overlaps(startsAt, endsAt, item.startsAt, item.endsAt))
    && !data.holidays.some((item) => overlaps(startsAt, endsAt, item.startsAt, item.endsAt))
}

function classifyUnavailable(employee: BookingEmployeeRecord, startsAt: Date, endsAt: Date,
  data: BookingAvailabilityData): DomainError {
  if (data.holidays.some((item) => overlaps(startsAt, endsAt, item.startsAt, item.endsAt))) {
    return new EmployeeUnavailableError('Branch is closed for a holiday')
  }
  if (employee.timeOffs.some((item) => overlaps(startsAt, endsAt, item.startsAt, item.endsAt))) {
    return new TimeOffConflictError('Employee has overlapping time off', { employeeId: employee.id })
  }
  if (employee.blocks.some((item) => overlaps(startsAt, endsAt, item.startsAt, item.endsAt))) {
    return new EmployeeUnavailableError('Employee has an overlapping booking', { employeeId: employee.id })
  }
  return new WorkingHourViolationError('Booking is outside employee working hours', { employeeId: employee.id })
}

function snapshot(item: PlannedItem, id: string): BookingItemSnapshotData {
  const subtotal = moneyToCents(item.service.effectivePrice); const rate = rateToBasisPoints(item.service.taxRate)
  const tax = item.service.taxType === 'NONE' ? 0n : item.service.taxMode === 'INCLUDED'
    ? roundDivide(subtotal * rate, 10_000n + rate) : roundDivide(subtotal * rate, 10_000n)
  const total = item.service.taxType === 'VAT' && item.service.taxMode === 'EXCLUDED' ? subtotal + tax : subtotal
  return { id, serviceId: item.service.id, employeeId: item.employee.id, serviceName: item.service.name,
    startsAt: item.startsAt, endsAt: item.endsAt, durationMinutes: item.durationMinutes, quantity: 1,
    unitPrice: centsToMoney(subtotal), discountAmount: '0.00', subtotalAmount: centsToMoney(subtotal),
    taxType: item.service.taxType, taxMode: item.service.taxMode, taxRate: item.service.taxRate,
    taxAmount: centsToMoney(tax), totalAmount: centsToMoney(total), notes: item.notes }
}

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  return aStart < bEnd && aEnd > bStart
}

export function zonedParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit',
    day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', weekday: 'short' })
    .formatToParts(date).reduce<Record<string, string>>((values, part) => ({ ...values, [part.type]: part.value }), {})
  const dateText = `${parts.year}-${parts.month}-${parts.day}`; const timeText = `${parts.hour}:${parts.minute}:${parts.second}`
  const days: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  return { date: dateText, time: timeText, hour: Number(parts.hour), minute: Number(parts.minute),
    second: Number(parts.second), dayOfWeek: days[parts.weekday!]! }
}

export function zonedDateTimeToUtc(date: string, time: string, timezone: string): Date {
  const target = Date.parse(`${date}T${time}Z`); let value = new Date(target)
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const actual = zonedParts(value, timezone); const local = Date.parse(`${actual.date}T${actual.time}Z`)
    value = new Date(value.getTime() + target - local)
  }
  const result = zonedParts(value, timezone)
  if (result.date !== date || result.time !== time) throw new RangeError('Local time does not exist in branch timezone')
  return value
}

function slotStarts(date: string, timezone: string, interval: number | null): Date[] {
  if (!interval || interval < 5 || interval > 60) return []
  const values: Date[] = []
  for (let minute = 0; minute < 24 * 60; minute += interval) {
    const hours = Math.floor(minute / 60).toString().padStart(2, '0'); const mins = (minute % 60).toString().padStart(2, '0')
    try { values.push(zonedDateTimeToUtc(date, `${hours}:${mins}:00`, timezone)) } catch { continue }
  }
  return values
}

function moneyToCents(value: string): bigint {
  const [whole = '0', fraction = ''] = value.split('.')
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0').slice(0, 2))
}
function centsToMoney(value: bigint) { return `${value / 100n}.${(value % 100n).toString().padStart(2, '0')}` }
function rateToBasisPoints(value: string) {
  const [whole = '0', fraction = ''] = value.split('.'); return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0').slice(0, 2))
}
function roundDivide(numerator: bigint, denominator: bigint) { return (numerator + denominator / 2n) / denominator }
