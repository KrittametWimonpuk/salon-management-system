import { describe, expect, it, vi } from 'vitest'
import type { BookingAvailabilityData, BookingRecord, BookingRepository,
  BookingStatusValue } from '../../src/application/foundation/repositories.js'
import { BookingPolicy, PolicyEngine, type PolicySubject } from '../../src/application/foundation/policy.js'
import type { TransactionManager, TransactionScope } from '../../src/application/foundation/transaction.js'
import { DomainEventFactory, InProcessDomainEventDispatcher } from '../../src/domain/foundation/domain-events.js'
import { success, type Result } from '../../src/domain/foundation/result.js'
import { FixedClock } from '../../src/infrastructure/foundation/system-adapters.js'
import { BookingAvailabilityEngine, zonedDateTimeToUtc } from '../../src/modules/booking/booking.engine.js'
import { BookingOperations, type BookingDependencies, type BookingUseCaseContext } from '../../src/modules/booking/booking.use-cases.js'

const organizationId = '10000000-0000-4000-8000-000000000001'
const branchId = '20000000-0000-4000-8000-000000000001'
const customerId = '30000000-0000-4000-8000-000000000001'
const serviceId = '40000000-0000-4000-8000-000000000001'
const employeeId = '50000000-0000-4000-8000-000000000001'
const bookingId = '60000000-0000-4000-8000-000000000001'
const itemId = '70000000-0000-4000-8000-000000000001'
const now = new Date('2026-08-08T00:00:00.000Z')
const startsAt = zonedDateTimeToUtc('2026-08-10', '09:00:00', 'Asia/Bangkok')
const endsAt = new Date(startsAt.getTime() + 60 * 60_000)

const availability: BookingAvailabilityData = { branchId, branchName: 'Main', timezone: 'Asia/Bangkok',
  slotIntervalMinutes: 15, services: [{ id: serviceId, name: 'Cut', durationMinutes: 60, effectivePrice: '500.00',
    taxType: 'NONE', taxMode: 'EXCLUDED', taxRate: '0.00', requiredSkills: [] }],
  employees: [{ id: employeeId, displayName: 'May', skills: [], workingHours: [{ dayOfWeek: 1,
    startTime: '09:00:00', endTime: '18:00:00', effectiveFrom: null, effectiveTo: null }], timeOffs: [], blocks: [] }],
  holidays: [] }
const booking: BookingRecord = { id: bookingId, branchId, branchName: 'Main', customerId, customerName: 'Jane',
  customerPhone: null, createdByUserId: 'user', bookingNumber: 'BKG-1', status: 'PENDING', source: 'PHONE',
  startsAt, endsAt, customerNotes: null, internalNotes: null, cancellationReason: null, cancelledAt: null,
  completedAt: null, deletedAt: null, subtotalAmount: '500.00', taxAmount: '0.00', totalAmount: '500.00',
  paymentStatus: 'PENDING', saleClosedAt: null, closedByUserId: null,
  items: [{ id: itemId, bookingId, serviceId, employeeId, employeeName: 'May', serviceName: 'Cut', status: 'SCHEDULED',
    startsAt, endsAt, durationMinutes: 60, quantity: 1, unitPrice: '500.00', discountAmount: '0.00',
    subtotalAmount: '500.00', taxType: 'NONE', taxMode: 'EXCLUDED', taxRate: '0.00', taxAmount: '0.00',
    totalAmount: '500.00', notes: null, createdAt: now, updatedAt: now }], createdAt: now, updatedAt: now }
const secondItem = { ...booking.items[0]!, id: '70000000-0000-4000-8000-000000000002',
  startsAt: endsAt, endsAt: new Date(endsAt.getTime() + 60 * 60_000) }
const multiItemBooking: BookingRecord = { ...booking, endsAt: secondItem.endsAt,
  items: [booking.items[0]!, secondItem], subtotalAmount: '1000.00', totalAmount: '1000.00' }

class Transactions implements TransactionManager {
  calls = 0
  constructor(private readonly repository: BookingRepository) {}
  async withTransaction<T, E>(work: (scope: TransactionScope) => Promise<Result<T, E>>) {
    this.calls += 1; return work({ bookings: this.repository } as TransactionScope)
  }
}

function repository(overrides: Partial<BookingRepository> = {}): {
  repository: BookingRepository
  createWithItems: ReturnType<typeof vi.fn<BookingRepository['createWithItems']>>
} {
  const createWithItems = vi.fn<BookingRepository['createWithItems']>().mockResolvedValue(booking)
  const value: BookingRepository = { findById: vi.fn().mockResolvedValue(success(booking)), findByIdAnyStatus: vi.fn().mockResolvedValue(success(booking)),
    findPage: vi.fn().mockResolvedValue({ items: [booking], page: 1, pageSize: 20, totalItems: 1, totalPages: 1 }),
    findCalendar: vi.fn().mockResolvedValue([booking]), loadAvailabilityData: vi.fn().mockResolvedValue(availability),
    findActiveCustomer: vi.fn().mockResolvedValue(true), acquireBookingLocks: vi.fn().mockResolvedValue(undefined),
    hasCustomerConflict: vi.fn().mockResolvedValue(false), createWithItems,
    updateMetadata: vi.fn().mockResolvedValue(booking), updateSchedule: vi.fn().mockResolvedValue(booking),
    transitionStatus: vi.fn().mockImplementation(async (_s, _i, _f, to: BookingStatusValue): Promise<BookingRecord> =>
      ({ ...booking, status: to })),
    addItem: vi.fn().mockResolvedValue(booking), updateItem: vi.fn().mockResolvedValue(booking),
    cancelItem: vi.fn().mockResolvedValue(booking), ...overrides }
  return { repository: value, createWithItems }
}

function harness(options: { permissions?: string[]; overrides?: Partial<BookingRepository>; selectedBranch?: string } = {}) {
  const spies = repository(options.overrides); const repo = spies.repository
  const transactions = new Transactions(repo); const clock = new FixedClock(now)
  const permissions = options.permissions ?? ['booking.create', 'booking.read', 'booking.update', 'booking.cancel',
    'booking.reschedule', 'booking.status.update', 'booking.availability.read', 'booking.item.manage']
  const selectedBranch = options.selectedBranch ?? branchId
  const subject: PolicySubject = { userId: 'user', organizationId, branchIds: new Set([selectedBranch]),
    permissions: new Set(permissions) }; const context: BookingUseCaseContext = { subject, branchId: selectedBranch }
  const dependencies: BookingDependencies = { repository: repo, transactions, policyEngine: new PolicyEngine(),
    policy: new BookingPolicy(), eventFactory: new DomainEventFactory(clock, { generate: () => 'event' }),
    events: new InProcessDomainEventDispatcher(), clock, ids: { generate: () => bookingId },
    availability: new BookingAvailabilityEngine() }
  return { operations: new BookingOperations(dependencies), context, repo, transactions, spies }
}

describe('Booking use cases', () => {
  it('creates a booking with snapshots inside a transaction', async () => {
    const test = harness(); const value = await test.operations.create(test.context, { customerId, source: 'PHONE',
      startsAt: startsAt.toISOString(), items: [{ serviceId, employeeId }] })
    expect(value).toMatchObject({ ok: true, value: { id: bookingId } }); expect(test.transactions.calls).toBe(1)
    expect(test.spies.createWithItems).toHaveBeenCalledWith(expect.objectContaining({ items: [expect.objectContaining({
      serviceId, employeeId, unitPrice: '500.00' })] }))
  })

  it('returns availability and enforces branch isolation', async () => {
    const test = harness()
    expect((await test.operations.getAvailability(test.context, { branchId, serviceIds: [serviceId],
      date: '2026-08-10', startTime: '09:00:00' })).ok).toBe(true)
    expect(await test.operations.getAvailability(test.context, { branchId: 'other', serviceIds: [serviceId],
      date: '2026-08-10' })).toMatchObject({ ok: false, error: { code: 'TENANT_ISOLATION' } })
    const invalidTimezone = harness({ overrides: { loadAvailabilityData: vi.fn()
      .mockResolvedValue({ ...availability, timezone: 'Invalid/Timezone' }) } })
    expect(await invalidTimezone.operations.getCalendar(invalidTimezone.context,
      { branchId, date: '2026-08-10', view: 'DAY' }))
      .toMatchObject({ ok: false, error: { code: 'BUSINESS_RULE_VIOLATION' } })
  })

  it('rejects policy denial before starting a write transaction', async () => {
    const test = harness({ permissions: [] })
    expect(await test.operations.create(test.context, { customerId, source: 'PHONE', startsAt: startsAt.toISOString(),
      items: [{ serviceId }] })).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } })
    expect(test.transactions.calls).toBe(0)
  })

  it('enforces valid status transitions and cancellation', async () => {
    const test = harness()
    expect(await test.operations.confirm(test.context, bookingId)).toMatchObject({ ok: true, value: { status: 'CONFIRMED' } })
    expect(await test.operations.complete(test.context, bookingId))
      .toMatchObject({ ok: false, error: { code: 'BUSINESS_RULE_VIOLATION' } })
    expect(await test.operations.cancel(test.context, bookingId, { reason: 'Customer request' }))
      .toMatchObject({ ok: true, value: { status: 'CANCELLED' } })
  })

  it('rejects customer conflicts and removal of the last item', async () => {
    const conflict = harness({ overrides: { hasCustomerConflict: vi.fn().mockResolvedValue(true) } })
    expect(await conflict.operations.create(conflict.context, { customerId, source: 'PHONE',
      startsAt: startsAt.toISOString(), items: [{ serviceId }] }))
      .toMatchObject({ ok: false, error: { code: 'CONFLICT' } })
    const test = harness()
    expect(await test.operations.removeItem(test.context, bookingId, itemId))
      .toMatchObject({ ok: false, error: { code: 'BUSINESS_RULE_VIOLATION' } })
  })

  it('updates metadata and serves tenant-scoped detail and list reads', async () => {
    const test = harness()
    expect(await test.operations.update(test.context, bookingId, { customerNotes: 'Call before arrival' }))
      .toMatchObject({ ok: true, value: { id: bookingId } })
    expect(await test.operations.get(test.context, bookingId)).toMatchObject({ ok: true, value: { id: bookingId } })
    expect(await test.operations.list(test.context, { branchId, page: 1, pageSize: 20,
      sort: 'startsAt', order: 'asc' })).toMatchObject({ ok: true, value: { totalItems: 1 } })
    expect(test.transactions.calls).toBe(1)
  })

  it('reschedules active items and rechecks availability inside the write transaction', async () => {
    const test = harness()
    expect(await test.operations.reschedule(test.context, bookingId,
      { startsAt: zonedDateTimeToUtc('2026-08-10', '11:00:00', 'Asia/Bangkok').toISOString(), reason: 'Requested' }))
      .toMatchObject({ ok: true, value: { id: bookingId } })
    expect(test.transactions.calls).toBe(1)
  })

  it('supports complete and no-show only from their allowed states', async () => {
    const completed = harness({ overrides: { findById: vi.fn().mockResolvedValue(success({ ...booking,
      status: 'IN_PROGRESS' })) } })
    expect(await completed.operations.complete(completed.context, bookingId))
      .toMatchObject({ ok: true, value: { status: 'COMPLETED' } })
    const noShow = harness({ overrides: { findById: vi.fn().mockResolvedValue(success({ ...booking,
      status: 'CONFIRMED' })) } })
    expect(await noShow.operations.noShow(noShow.context, bookingId))
      .toMatchObject({ ok: true, value: { status: 'NO_SHOW' } })
  })

  it('adds, updates, and soft-removes booking items through transactions', async () => {
    const add = harness()
    expect(await add.operations.addItem(add.context, bookingId, { serviceId, employeeId }))
      .toMatchObject({ ok: true, value: { id: bookingId } })
    const change = harness({ overrides: { findById: vi.fn().mockResolvedValue(success(multiItemBooking)) } })
    expect(await change.operations.updateItem(change.context, bookingId, itemId, { notes: 'Changed' }))
      .toMatchObject({ ok: true, value: { id: bookingId } })
    expect(await change.operations.removeItem(change.context, bookingId, itemId))
      .toMatchObject({ ok: true, value: { id: bookingId } })
    expect(add.transactions.calls).toBe(1); expect(change.transactions.calls).toBe(2)
  })
})
