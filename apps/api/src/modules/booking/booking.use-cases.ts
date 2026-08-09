import type { BookingCalendarQuery, BookingItemRecord, BookingItemScheduleData, BookingListQuery, BookingRecord,
  BookingRepository, BookingStatusValue, TenantScope, UpdateBookingMetadataData } from '../../application/foundation/repositories.js'
import type { PageResult } from '../../application/foundation/query.js'
import type { BookingPolicy, PolicyEngine, PolicySubject } from '../../application/foundation/policy.js'
import type { TransactionManager } from '../../application/foundation/transaction.js'
import { BookingConflictError, BookingNotFoundError, BusinessRuleViolationError, ConflictError,
  ServiceUnavailableAtBranchError, TenantIsolationError, type DomainError } from '../../domain/foundation/domain-errors.js'
import type { DomainEventFactory, DomainEventPublisher } from '../../domain/foundation/domain-events.js'
import type { IdGenerator } from '../../domain/foundation/id-generator.js'
import { failure, success, type Result } from '../../domain/foundation/result.js'
import type { Clock } from '../../domain/foundation/time.js'
import { zonedDateTimeToUtc, zonedParts, type AvailabilityResult, type BookingAvailabilityEngine,
  type ScheduleRequestItem } from './booking.engine.js'
import { BookingEventName } from './booking.events.js'
import type { AddBookingItemRequest, AvailabilityRequest, BookingListRequest, CalendarRequest, CancelBookingRequest,
  CreateBookingRequest, RescheduleBookingRequest, UpdateBookingItemRequest, UpdateBookingRequest } from './booking.schemas.js'
import { validateBookingTransition } from './booking.state-machine.js'

export interface BookingUseCaseContext { subject: PolicySubject; branchId: string }
export interface BookingDependencies {
  repository: BookingRepository
  transactions: TransactionManager
  policyEngine: PolicyEngine
  policy: BookingPolicy
  eventFactory: DomainEventFactory
  events: DomainEventPublisher
  clock: Clock
  ids: IdGenerator
  availability: BookingAvailabilityEngine
}

export class BookingOperations {
  constructor(private readonly dependencies: BookingDependencies) {}

  async getAvailability(context: BookingUseCaseContext, input: AvailabilityRequest): Promise<Result<AvailabilityResult, DomainError>> {
    const branch = this.requireBranch(context, input.branchId); if (!branch.ok) return branch
    const allowed = this.authorize(context, 'booking.availability.read'); if (!allowed.ok) return allowed
    const range = broadDateRange(input.date)
    const data = await this.dependencies.repository.loadAvailabilityData(this.scope(context), input.branchId,
      input.serviceIds, range.startsAt, range.endsAt)
    if (!data) return failure(new ServiceUnavailableAtBranchError('Branch was not found'))
    return this.dependencies.availability.availability(data, input.serviceIds.map((serviceId) => ({ serviceId,
      ...(input.employeeId ? { employeeId: input.employeeId } : {}) })), input.date, input.startTime)
  }

  async getCalendar(context: BookingUseCaseContext, input: CalendarRequest) {
    const branch = this.requireBranch(context, input.branchId); if (!branch.ok) return branch
    const allowed = this.authorize(context, 'booking.read'); if (!allowed.ok) return allowed
    const broad = broadDateRange(input.date)
    const config = await this.dependencies.repository.loadAvailabilityData(this.scope(context), input.branchId, [],
      broad.startsAt, broad.endsAt)
    if (!config) return failure(new BookingNotFoundError('Branch was not found'))
    let date: string; let startsAt: Date; let endsAt: Date
    try {
      date = input.view === 'WEEK' ? mondayOf(input.date, config.timezone) : input.date
      startsAt = zonedDateTimeToUtc(date, '00:00:00', config.timezone)
      endsAt = zonedDateTimeToUtc(addDays(date, input.view === 'WEEK' ? 7 : 1), '00:00:00', config.timezone)
    } catch {
      return failure(new BusinessRuleViolationError('Branch timezone is invalid for the requested calendar range'))
    }
    const query: BookingCalendarQuery = { branchId: context.branchId, startsAt, endsAt,
      ...(input.employeeId ? { employeeId: input.employeeId } : {}) }
    return success(await this.dependencies.repository.findCalendar(this.scope(context), query))
  }

  async create(context: BookingUseCaseContext, input: CreateBookingRequest) {
    const allowed = this.authorize(context, 'booking.create'); if (!allowed.ok) return allowed
    const startsAt = new Date(input.startsAt)
    if (startsAt <= this.dependencies.clock.utc()) return failure(new BusinessRuleViolationError('Booking must start in the future'))
    const requests = input.items.map((item) => ({ serviceId: item.serviceId,
      ...(item.employeeId ? { employeeId: item.employeeId } : {}), notes: item.notes ?? null }))
    const result = await this.dependencies.transactions.withTransaction<BookingRecord, DomainError>(async ({ bookings }) => {
      if (!await bookings.findActiveCustomer(this.scope(context), input.customerId)) {
        return failure(new BookingNotFoundError('Active customer was not found'))
      }
      const prepared = await this.preparePlan(bookings, context, requests, startsAt)
      if (!prepared.ok) return prepared
      const date = zonedParts(startsAt, prepared.value.data.timezone).date
      await bookings.acquireBookingLocks(this.scope(context), [`branch:${context.branchId}:${date}`,
        `customer:${input.customerId}:${date}`, ...prepared.value.plan.items.map((item) => `employee:${item.employee.id}:${date}`)])
      const checked = await this.preparePlan(bookings, context, requests, startsAt)
      if (!checked.ok) return checked
      if (await bookings.hasCustomerConflict(this.scope(context), input.customerId, startsAt, checked.value.plan.endsAt)) {
        return failure(new BookingConflictError('Customer has an overlapping booking'))
      }
      const id = this.dependencies.ids.generate()
      return success(await bookings.createWithItems({ id, branchId: context.branchId, customerId: input.customerId,
        createdByUserId: context.subject.userId, bookingNumber: bookingNumber(id), source: input.source,
        startsAt, endsAt: checked.value.plan.endsAt, customerNotes: input.customerNotes ?? null,
        internalNotes: input.internalNotes ?? null, items: this.dependencies.availability.snapshots(checked.value.plan, this.dependencies.ids) }))
    })
    return this.publish(result, BookingEventName.CREATED, result.ok ? result.value.id : '', {})
  }

  async update(context: BookingUseCaseContext, id: string, input: UpdateBookingRequest) {
    const result = await this.dependencies.transactions.withTransaction<BookingRecord, DomainError>(async ({ bookings }) => {
      const booking = await bookings.findById(this.scope(context), id); if (!booking.ok) return booking
      const allowed = this.authorize(context, 'booking.update'); if (!allowed.ok) return allowed
      if (!['PENDING', 'CONFIRMED'].includes(booking.value.status)) return failure(new BusinessRuleViolationError('Booking can no longer be edited'))
      await bookings.acquireBookingLocks(this.scope(context), [`booking:${id}`])
      const data: UpdateBookingMetadataData = {
        ...(input.customerNotes !== undefined ? { customerNotes: input.customerNotes } : {}),
        ...(input.internalNotes !== undefined ? { internalNotes: input.internalNotes } : {}),
        ...(input.source !== undefined ? { source: input.source } : {}),
      }
      const value = await bookings.updateMetadata(this.scope(context), id, data)
      return value ? success(value) : failure(new BookingNotFoundError('Booking was not found'))
    })
    return this.publish(result, BookingEventName.UPDATED, id, { changedFields: Object.keys(input) })
  }

  async get(context: BookingUseCaseContext, id: string): Promise<Result<BookingRecord, DomainError>> {
    const allowed = this.authorize(context, 'booking.read'); return allowed.ok
      ? this.dependencies.repository.findByIdAnyStatus(this.scope(context), id) : allowed
  }

  async list(context: BookingUseCaseContext, query: BookingListQuery): Promise<Result<PageResult<BookingRecord>, DomainError>> {
    if (query.branchId !== context.branchId) return failure(new TenantIsolationError('Branch filter must match branch context'))
    const allowed = this.authorize(context, 'booking.read'); return allowed.ok
      ? success(await this.dependencies.repository.findPage(this.scope(context), query)) : allowed
  }

  async cancel(context: BookingUseCaseContext, id: string, input: CancelBookingRequest) {
    return this.transition(context, id, 'CANCELLED', 'booking.cancel', BookingEventName.CANCELLED, input.reason)
  }

  async reschedule(context: BookingUseCaseContext, id: string, input: RescheduleBookingRequest) {
    const startsAt = new Date(input.startsAt)
    if (startsAt <= this.dependencies.clock.utc()) return failure(new BusinessRuleViolationError('Booking must start in the future'))
    const result = await this.dependencies.transactions.withTransaction<BookingRecord, DomainError>(async ({ bookings }) => {
      const current = await bookings.findById(this.scope(context), id); if (!current.ok) return current
      const allowed = this.authorize(context, 'booking.reschedule'); if (!allowed.ok) return allowed
      if (!['PENDING', 'CONFIRMED'].includes(current.value.status)) return failure(new BusinessRuleViolationError('Booking cannot be rescheduled in its current status'))
      const active = activeItems(current.value)
      const requests = active.map((item) => ({ serviceId: item.serviceId, employeeId: item.employeeId,
        durationMinutes: item.durationMinutes, notes: item.notes }))
      const prepared = await this.preparePlan(bookings, context, requests, startsAt, id); if (!prepared.ok) return prepared
      const date = zonedParts(startsAt, prepared.value.data.timezone).date
      await bookings.acquireBookingLocks(this.scope(context), [`booking:${id}`, `customer:${current.value.customerId}:${date}`,
        ...prepared.value.plan.items.map((item) => `employee:${item.employee.id}:${date}`)])
      const checked = await this.preparePlan(bookings, context, requests, startsAt, id); if (!checked.ok) return checked
      if (await bookings.hasCustomerConflict(this.scope(context), current.value.customerId, startsAt,
        checked.value.plan.endsAt, id)) return failure(new BookingConflictError('Customer has an overlapping booking'))
      const schedules = checked.value.plan.items.map((item, index) => ({ id: active[index]!.id,
        employeeId: item.employee.id, startsAt: item.startsAt, endsAt: item.endsAt }))
      const value = await bookings.updateSchedule(this.scope(context), id, startsAt, checked.value.plan.endsAt, schedules)
      return value ? success(value) : failure(new BookingNotFoundError('Booking was not found'))
    })
    return this.publish(result, BookingEventName.RESCHEDULED, id, { reason: input.reason, startsAt: input.startsAt })
  }

  confirm(context: BookingUseCaseContext, id: string) { return this.transition(context, id, 'CONFIRMED', 'booking.status.update', BookingEventName.CONFIRMED) }
  checkIn(context: BookingUseCaseContext, id: string) { return this.transition(context, id, 'CHECKED_IN', 'booking.status.update', BookingEventName.CHECKED_IN) }
  start(context: BookingUseCaseContext, id: string) { return this.transition(context, id, 'IN_PROGRESS', 'booking.status.update', BookingEventName.STARTED) }
  complete(context: BookingUseCaseContext, id: string) { return this.transition(context, id, 'COMPLETED', 'booking.status.update', BookingEventName.COMPLETED) }
  noShow(context: BookingUseCaseContext, id: string) { return this.transition(context, id, 'NO_SHOW', 'booking.status.update', BookingEventName.NO_SHOW) }

  async addItem(context: BookingUseCaseContext, id: string, input: AddBookingItemRequest) {
    const result = await this.dependencies.transactions.withTransaction<BookingRecord, DomainError>(async ({ bookings }) => {
      const current = await bookings.findById(this.scope(context), id); if (!current.ok) return current
      const allowed = this.authorize(context, 'booking.item.manage'); if (!allowed.ok) return allowed
      if (!editable(current.value)) return failure(new BusinessRuleViolationError('Booking items can no longer be changed'))
      const request: ScheduleRequestItem = { serviceId: input.serviceId,
        ...(input.employeeId ? { employeeId: input.employeeId } : {}), notes: input.notes ?? null }
      const prepared = await this.preparePlan(bookings, context, [request], current.value.endsAt, id); if (!prepared.ok) return prepared
      const date = zonedParts(current.value.endsAt, prepared.value.data.timezone).date
      await bookings.acquireBookingLocks(this.scope(context), [`booking:${id}`, `customer:${current.value.customerId}:${date}`,
        ...prepared.value.plan.items.map((item) => `employee:${item.employee.id}:${date}`)])
      const checked = await this.preparePlan(bookings, context, [request], current.value.endsAt, id); if (!checked.ok) return checked
      if (await bookings.hasCustomerConflict(this.scope(context), current.value.customerId, current.value.startsAt,
        checked.value.plan.endsAt, id)) return failure(new BookingConflictError('Customer has an overlapping booking'))
      const item = this.dependencies.availability.snapshots(checked.value.plan, this.dependencies.ids)[0]!
      const value = await bookings.addItem(this.scope(context), id, checked.value.plan.endsAt, item)
      return value ? success(value) : failure(new BookingNotFoundError('Booking was not found'))
    })
    return this.publish(result, BookingEventName.ITEM_ADDED, id, { serviceId: input.serviceId })
  }

  async updateItem(context: BookingUseCaseContext, id: string, itemId: string, input: UpdateBookingItemRequest) {
    const result = await this.dependencies.transactions.withTransaction<BookingRecord, DomainError>(async ({ bookings }) => {
      const current = await bookings.findById(this.scope(context), id); if (!current.ok) return current
      const allowed = this.authorize(context, 'booking.item.manage'); if (!allowed.ok) return allowed
      if (!editable(current.value)) return failure(new BusinessRuleViolationError('Booking items can no longer be changed'))
      const items = activeItems(current.value); const index = items.findIndex((item) => item.id === itemId)
      if (index < 0) return failure(new BookingNotFoundError('Booking item was not found'))
      const target = items[index]!; const requests: ScheduleRequestItem[] = [{ serviceId: input.serviceId ?? target.serviceId,
        ...((input.employeeId === undefined ? target.employeeId : input.employeeId) ?
          { employeeId: (input.employeeId === undefined ? target.employeeId : input.employeeId)! } : {}),
        notes: input.notes !== undefined ? input.notes : target.notes }, ...items.slice(index + 1).map(existingRequest)]
      const prepared = await this.preparePlan(bookings, context, requests, target.startsAt, id); if (!prepared.ok) return prepared
      const date = zonedParts(target.startsAt, prepared.value.data.timezone).date
      await bookings.acquireBookingLocks(this.scope(context), [`booking:${id}`, `customer:${current.value.customerId}:${date}`,
        ...prepared.value.plan.items.map((item) => `employee:${item.employee.id}:${zonedParts(item.startsAt, prepared.value.data.timezone).date}`)])
      const checked = await this.preparePlan(bookings, context, requests, target.startsAt, id); if (!checked.ok) return checked
      if (await bookings.hasCustomerConflict(this.scope(context), current.value.customerId, current.value.startsAt,
        checked.value.plan.endsAt, id)) return failure(new BookingConflictError('Customer has an overlapping booking'))
      const updated = { ...this.dependencies.availability.snapshots(checked.value.plan, this.dependencies.ids)[0]!, id: itemId }
      const following = checked.value.plan.items.slice(1).map((item, offset) => ({ id: items[index + 1 + offset]!.id,
        employeeId: item.employee.id, startsAt: item.startsAt, endsAt: item.endsAt }))
      const value = await bookings.updateItem(this.scope(context), id, itemId, updated, checked.value.plan.endsAt, following)
      return value ? success(value) : failure(new BookingNotFoundError('Booking item was not found'))
    })
    return this.publish(result, BookingEventName.ITEM_UPDATED, id, { itemId, changedFields: Object.keys(input) })
  }

  async removeItem(context: BookingUseCaseContext, id: string, itemId: string) {
    const result = await this.dependencies.transactions.withTransaction<BookingRecord, DomainError>(async ({ bookings }) => {
      const current = await bookings.findById(this.scope(context), id); if (!current.ok) return current
      const allowed = this.authorize(context, 'booking.item.manage'); if (!allowed.ok) return allowed
      if (!editable(current.value)) return failure(new BusinessRuleViolationError('Booking items can no longer be changed'))
      const items = activeItems(current.value); if (items.length <= 1) return failure(new BusinessRuleViolationError('Booking must retain at least one active item'))
      const index = items.findIndex((item) => item.id === itemId); if (index < 0) return failure(new BookingNotFoundError('Booking item was not found'))
      const target = items[index]!; const later = items.slice(index + 1); let following: BookingItemScheduleData[] = []
      let endsAt = items[index - 1]?.endsAt ?? target.startsAt
      if (later.length) {
        const prepared = await this.preparePlan(bookings, context, later.map(existingRequest), target.startsAt, id)
        if (!prepared.ok) return prepared
        const date = zonedParts(target.startsAt, prepared.value.data.timezone).date
        await bookings.acquireBookingLocks(this.scope(context), [`booking:${id}`, `customer:${current.value.customerId}:${date}`,
          ...prepared.value.plan.items.map((item) =>
            `employee:${item.employee.id}:${zonedParts(item.startsAt, prepared.value.data.timezone).date}`)])
        const checked = await this.preparePlan(bookings, context, later.map(existingRequest), target.startsAt, id)
        if (!checked.ok) return checked
        following = checked.value.plan.items.map((item, offset) => ({ id: later[offset]!.id,
          employeeId: item.employee.id, startsAt: item.startsAt, endsAt: item.endsAt })); endsAt = checked.value.plan.endsAt
      } else {
        await bookings.acquireBookingLocks(this.scope(context), [`booking:${id}`])
      }
      const startsAt = index === 0 ? following[0]!.startsAt : current.value.startsAt
      if (await bookings.hasCustomerConflict(this.scope(context), current.value.customerId, startsAt, endsAt, id)) {
        return failure(new BookingConflictError('Customer has an overlapping booking'))
      }
      const value = await bookings.cancelItem(this.scope(context), id, itemId, startsAt, endsAt, following)
      return value ? success(value) : failure(new BookingNotFoundError('Booking item was not found'))
    })
    return this.publish(result, BookingEventName.ITEM_REMOVED, id, { itemId })
  }

  private async transition(context: BookingUseCaseContext, id: string, to: BookingStatusValue,
    permission: string, event: string, reason?: string) {
    const result = await this.dependencies.transactions.withTransaction<BookingRecord, DomainError>(async ({ bookings }) => {
      const current = await bookings.findById(this.scope(context), id); if (!current.ok) return current
      const allowed = this.authorize(context, permission); if (!allowed.ok) return allowed
      const transition = validateBookingTransition(current.value.status, to); if (!transition.ok) return transition
      await bookings.acquireBookingLocks(this.scope(context), [`booking:${id}`])
      const value = await bookings.transitionStatus(this.scope(context), id, current.value.status, to,
        this.dependencies.clock.utc(), reason)
      return value ? success(value) : failure(new ConflictError('Booking status changed concurrently'))
    })
    return this.publish(result, event, id, reason ? { reason } : {})
  }

  private async preparePlan(repository: BookingRepository, context: BookingUseCaseContext,
    requests: readonly ScheduleRequestItem[], startsAt: Date, excludeBookingId?: string) {
    const range = around(startsAt)
    const data = await repository.loadAvailabilityData(this.scope(context), context.branchId,
      [...new Set(requests.map((item) => item.serviceId))], range.startsAt, range.endsAt, excludeBookingId)
    if (!data) return failure(new ServiceUnavailableAtBranchError('Branch was not found'))
    const plan = this.dependencies.availability.planAt(data, requests, startsAt)
    return plan.ok ? success({ data, plan: plan.value }) : plan
  }

  private scope(context: BookingUseCaseContext): TenantScope {
    return { organizationId: context.subject.organizationId, branchId: context.branchId }
  }
  private authorize(context: BookingUseCaseContext, permission: string) {
    return this.dependencies.policyEngine.authorize(this.dependencies.policy, context.subject, { permission },
      { organizationId: context.subject.organizationId, branchId: context.branchId, ownerId: null })
  }
  private requireBranch(context: BookingUseCaseContext, branchId: string): Result<void, TenantIsolationError> {
    return branchId === context.branchId ? success(undefined) : failure(new TenantIsolationError('Branch must match branch context'))
  }
  private async publish<T>(result: Result<T, DomainError>, name: string, id: string,
    payload: Readonly<Record<string, unknown>>): Promise<Result<T, DomainError>> {
    if (!result.ok) return result
    const published = await this.dependencies.events.publish([this.dependencies.eventFactory.create({ name,
      aggregateId: id, payload: { bookingId: id, ...payload } })])
    return published.ok ? result : published
  }
}

function activeItems(booking: BookingRecord) { return booking.items.filter((item) => item.status !== 'CANCELLED') }
function editable(booking: BookingRecord) { return booking.status === 'PENDING' || booking.status === 'CONFIRMED' }
function existingRequest(item: BookingItemRecord): ScheduleRequestItem {
  return { serviceId: item.serviceId, employeeId: item.employeeId, durationMinutes: item.durationMinutes, notes: item.notes }
}
function bookingNumber(id: string) { return `BKG-${id.replaceAll('-', '').slice(0, 32).toUpperCase()}` }
function broadDateRange(date: string) { const start = new Date(`${addDays(date, -1)}T00:00:00.000Z`)
  return { startsAt: start, endsAt: new Date(`${addDays(date, 2)}T00:00:00.000Z`) } }
function around(date: Date) { return { startsAt: new Date(date.getTime() - 86_400_000),
  endsAt: new Date(date.getTime() + 2 * 86_400_000) } }
function addDays(date: string, days: number) { const value = new Date(`${date}T12:00:00.000Z`)
  value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10) }
function mondayOf(date: string, timezone: string) { const noon = zonedDateTimeToUtc(date, '12:00:00', timezone)
  const day = zonedParts(noon, timezone).dayOfWeek; return addDays(date, -((day + 6) % 7)) }

export class GetBookingAvailability { constructor(private readonly o: BookingOperations) {} execute(c: BookingUseCaseContext, i: AvailabilityRequest) { return this.o.getAvailability(c, i) } }
export class GetEmployeeAvailability extends GetBookingAvailability {}
export class GetBranchCalendar { constructor(private readonly o: BookingOperations) {} execute(c: BookingUseCaseContext, i: CalendarRequest) { return this.o.getCalendar(c, i) } }
export class CreateBooking { constructor(private readonly o: BookingOperations) {} execute(c: BookingUseCaseContext, i: CreateBookingRequest) { return this.o.create(c, i) } }
export class UpdateBooking { constructor(private readonly o: BookingOperations) {} execute(c: BookingUseCaseContext, id: string, i: UpdateBookingRequest) { return this.o.update(c, id, i) } }
export class GetBooking { constructor(private readonly o: BookingOperations) {} execute(c: BookingUseCaseContext, id: string) { return this.o.get(c, id) } }
export class GetBookingList { constructor(private readonly o: BookingOperations) {} execute(c: BookingUseCaseContext, q: BookingListQuery) { return this.o.list(c, q) } }
export class SearchBooking extends GetBookingList {}
export class CancelBooking { constructor(private readonly o: BookingOperations) {} execute(c: BookingUseCaseContext, id: string, i: CancelBookingRequest) { return this.o.cancel(c, id, i) } }
export class RescheduleBooking { constructor(private readonly o: BookingOperations) {} execute(c: BookingUseCaseContext, id: string, i: RescheduleBookingRequest) { return this.o.reschedule(c, id, i) } }
export class ConfirmBooking { constructor(private readonly o: BookingOperations) {} execute(c: BookingUseCaseContext, id: string) { return this.o.confirm(c, id) } }
export class CheckInBooking { constructor(private readonly o: BookingOperations) {} execute(c: BookingUseCaseContext, id: string) { return this.o.checkIn(c, id) } }
export class StartBooking { constructor(private readonly o: BookingOperations) {} execute(c: BookingUseCaseContext, id: string) { return this.o.start(c, id) } }
export class CompleteBooking { constructor(private readonly o: BookingOperations) {} execute(c: BookingUseCaseContext, id: string) { return this.o.complete(c, id) } }
export class MarkNoShow { constructor(private readonly o: BookingOperations) {} execute(c: BookingUseCaseContext, id: string) { return this.o.noShow(c, id) } }
export class AddBookingItem { constructor(private readonly o: BookingOperations) {} execute(c: BookingUseCaseContext, id: string, i: AddBookingItemRequest) { return this.o.addItem(c, id, i) } }
export class UpdateBookingItem { constructor(private readonly o: BookingOperations) {} execute(c: BookingUseCaseContext, id: string, item: string, i: UpdateBookingItemRequest) { return this.o.updateItem(c, id, item, i) } }
export class RemoveBookingItem { constructor(private readonly o: BookingOperations) {} execute(c: BookingUseCaseContext, id: string, item: string) { return this.o.removeItem(c, id, item) } }

export function toBookingListQuery(input: BookingListRequest, branchId: string): BookingListQuery {
  return { branchId: input.branchId ?? branchId, page: input.page, pageSize: input.pageSize, sort: input.sort, order: input.order,
    ...(input.keyword ? { keyword: input.keyword } : {}), ...(input.customerId ? { customerId: input.customerId } : {}),
    ...(input.employeeId ? { employeeId: input.employeeId } : {}), ...(input.status ? { status: input.status } : {}),
    ...(input.dateFrom ? { dateFrom: new Date(input.dateFrom) } : {}), ...(input.dateTo ? { dateTo: new Date(input.dateTo) } : {}),
    ...(input.serviceId ? { serviceId: input.serviceId } : {}) }
}
