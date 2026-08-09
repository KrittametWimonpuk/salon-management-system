import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { BookingPolicy, PolicyEngine, type PolicySubject } from '../../src/application/foundation/policy.js'
import { DomainEventFactory, InProcessDomainEventDispatcher } from '../../src/domain/foundation/domain-events.js'
import { FixedClock } from '../../src/infrastructure/foundation/system-adapters.js'
import { createPrismaRepositories } from '../../src/infrastructure/repositories/prisma-repositories.js'
import { PrismaTransactionManager } from '../../src/infrastructure/transaction/prisma-transaction-manager.js'
import { BookingAvailabilityEngine } from '../../src/modules/booking/booking.engine.js'
import { BookingOperations, type BookingDependencies,
  type BookingUseCaseContext } from '../../src/modules/booking/booking.use-cases.js'

const databaseUrl = process.env.TEST_DATABASE_URL
const database = databaseUrl ? new PrismaClient({ datasources: { db: { url: databaseUrl } } }) : null
const now = new Date('2026-08-08T00:00:00.000Z')
const suitePrefix = 'Booking Integration'
const permissions = new Set(['booking.create', 'booking.read', 'booking.update', 'booking.cancel',
  'booking.reschedule', 'booking.status.update', 'booking.availability.read', 'booking.item.manage'])

describe.runIf(database !== null)('Booking PostgreSQL integration', () => {
  let organizationId: string
  let otherOrganizationId: string
  let branchId: string
  let otherBranchId: string
  let userId: string
  let customerId: string
  let otherCustomerId: string
  let serviceId: string
  let simpleServiceId: string
  let employeeId: string
  let otherEmployeeId: string
  let operations: BookingOperations
  let transactions: PrismaTransactionManager

  beforeAll(async () => database!.$connect())
  beforeEach(async () => {
    const primary = await database!.organization.create({ data: { name: `${suitePrefix} ${randomUUID()}`,
      timezone: 'Asia/Bangkok', currency: 'THB' } })
    const other = await database!.organization.create({ data: { name: `${suitePrefix} Other ${randomUUID()}`,
      timezone: 'Asia/Bangkok', currency: 'THB' } })
    organizationId = primary.id; otherOrganizationId = other.id
    const branch = await database!.branch.create({ data: { organizationId, code: 'MAIN', name: 'Main Salon',
      countryCode: 'TH', timezone: 'Asia/Bangkok' } })
    const otherBranch = await database!.branch.create({ data: { organizationId: otherOrganizationId,
      code: 'OTHER', name: 'Other Salon', countryCode: 'TH' } })
    branchId = branch.id; otherBranchId = otherBranch.id
    const user = await database!.user.create({ data: { organizationId, email: `${randomUUID()}@booking.test`,
      passwordHash: 'integration-test-password-hash', displayName: 'Scheduler' } })
    userId = user.id
    const [customer, otherCustomer] = await Promise.all([
      database!.customer.create({ data: { organizationId, preferredBranchId: branchId,
        customerNumber: `C-${randomUUID()}`, firstName: 'Jane', phone: `08${Date.now()}1` } }),
      database!.customer.create({ data: { organizationId, preferredBranchId: branchId,
        customerNumber: `C-${randomUUID()}`, firstName: 'June', phone: `08${Date.now()}2` } }),
    ])
    customerId = customer.id; otherCustomerId = otherCustomer.id
    const category = await database!.serviceCategory.create({ data: { organizationId, name: `Hair ${randomUUID()}` } })
    const skill = await database!.skill.create({ data: { organizationId, name: `Precision ${randomUUID()}` } })
    const [service, simpleService] = await Promise.all([
      database!.service.create({ data: { organizationId, categoryId: category.id, code: `CUT-${randomUUID().slice(0, 12)}`,
        name: 'Precision Cut', durationMinutes: 60, price: '500.00', taxType: 'VAT', taxMode: 'INCLUDED', taxRate: '7.00' } }),
      database!.service.create({ data: { organizationId, categoryId: category.id, code: `WASH-${randomUUID().slice(0, 12)}`,
        name: 'Wash', durationMinutes: 30, price: '200.00', taxType: 'VAT', taxMode: 'EXCLUDED', taxRate: '7.00' } }),
    ])
    serviceId = service.id; simpleServiceId = simpleService.id
    await database!.serviceSkill.create({ data: { serviceId, skillId: skill.id, requiredLevel: 4 } })
    await Promise.all([
      database!.branchService.create({ data: { branchId, serviceId, priceOverride: '535.00', durationOverrideMinutes: 60 } }),
      database!.branchService.create({ data: { branchId, serviceId: simpleServiceId } }),
      database!.setting.create({ data: { organizationId, branchId, key: 'booking.slot_interval_minutes',
        value: 15, valueType: 'NUMBER' } }),
    ])
    const [employee, otherEmployee] = await Promise.all([
      database!.employee.create({ data: { organizationId, employeeCode: `E-${randomUUID()}`,
        displayName: 'May Stylist' } }),
      database!.employee.create({ data: { organizationId, employeeCode: `E-${randomUUID()}`,
        displayName: 'Noi Assistant' } }),
    ])
    employeeId = employee.id; otherEmployeeId = otherEmployee.id
    const [assignment, otherAssignment] = await Promise.all([
      database!.employeeBranch.create({ data: { employeeId, branchId, isPrimary: true } }),
      database!.employeeBranch.create({ data: { employeeId: otherEmployeeId, branchId, isPrimary: true } }),
    ])
    await database!.employeeSkill.create({ data: { employeeId, skillId: skill.id, proficiencyLevel: 5 } })
    await Promise.all([assignment.id, otherAssignment.id].map((employeeBranchId) =>
      database!.workingHour.create({ data: { employeeBranchId, dayOfWeek: 1,
        startTime: new Date('1970-01-01T09:00:00.000Z'), endTime: new Date('1970-01-01T18:00:00.000Z') } })))
    const clock = new FixedClock(now)
    transactions = new PrismaTransactionManager(database!)
    const dependencies: BookingDependencies = { repository: createPrismaRepositories(database!).bookings,
      transactions, policyEngine: new PolicyEngine(), policy: new BookingPolicy(),
      eventFactory: new DomainEventFactory(clock, { generate: randomUUID }),
      events: new InProcessDomainEventDispatcher(), clock, ids: { generate: randomUUID },
      availability: new BookingAvailabilityEngine() }
    operations = new BookingOperations(dependencies)
  })

  afterEach(async () => {
    const organizations = await database!.organization.findMany({ where: { name: { startsWith: suitePrefix } },
      select: { id: true } })
    const ids = organizations.map(({ id }) => id); if (!ids.length) return
    await database!.bookingItem.deleteMany({ where: { booking: { branch: { organizationId: { in: ids } } } } })
    await database!.booking.deleteMany({ where: { branch: { organizationId: { in: ids } } } })
    await database!.employeeTimeOff.deleteMany({ where: { employee: { organizationId: { in: ids } } } })
    await database!.holiday.deleteMany({ where: { branch: { organizationId: { in: ids } } } })
    await database!.workingHour.deleteMany({ where: { employeeBranch: { employee: { organizationId: { in: ids } } } } })
    await database!.employeeSkill.deleteMany({ where: { employee: { organizationId: { in: ids } } } })
    await database!.serviceSkill.deleteMany({ where: { service: { organizationId: { in: ids } } } })
    await database!.branchService.deleteMany({ where: { service: { organizationId: { in: ids } } } })
    await database!.employeeBranch.deleteMany({ where: { employee: { organizationId: { in: ids } } } })
    await database!.employee.deleteMany({ where: { organizationId: { in: ids } } })
    await database!.service.deleteMany({ where: { organizationId: { in: ids } } })
    await database!.serviceCategory.deleteMany({ where: { organizationId: { in: ids } } })
    await database!.skill.deleteMany({ where: { organizationId: { in: ids } } })
    await database!.customer.deleteMany({ where: { organizationId: { in: ids } } })
    await database!.setting.deleteMany({ where: { organizationId: { in: ids } } })
    await database!.user.deleteMany({ where: { organizationId: { in: ids } } })
    await database!.branch.deleteMany({ where: { organizationId: { in: ids } } })
    await database!.organization.deleteMany({ where: { id: { in: ids } } })
  })
  afterAll(async () => database!.$disconnect())

  function context(selectedBranch = branchId, organization = organizationId): BookingUseCaseContext {
    const subject: PolicySubject = { userId, organizationId: organization, branchIds: new Set([selectedBranch]), permissions }
    return { subject, branchId: selectedBranch }
  }

  async function createBooking(startsAt = '2026-08-10T09:00:00+07:00', customer = customerId,
    employee = employeeId, service = serviceId) {
    const result = await operations.create(context(), { customerId: customer, source: 'PHONE', startsAt,
      items: [{ serviceId: service, employeeId: employee }] })
    if (!result.ok) throw new Error(result.error.message)
    return result.value
  }

  it('creates sequential items with immutable branch, price, duration, and tax snapshots', async () => {
    const result = await operations.create(context(), { customerId, source: 'WEBSITE',
      startsAt: '2026-08-10T09:00:00+07:00', items: [{ serviceId, employeeId },
        { serviceId: simpleServiceId, employeeId }] })
    expect(result.ok).toBe(true); if (!result.ok) return
    expect(result.value).toMatchObject({ branchId, status: 'PENDING', subtotalAmount: '735.00',
      taxAmount: '49.00', totalAmount: '749.00' })
    expect(result.value.items).toMatchObject([
      { serviceName: 'Precision Cut', durationMinutes: 60, unitPrice: '535.00', taxAmount: '35.00', totalAmount: '535.00' },
      { serviceName: 'Wash', durationMinutes: 30, unitPrice: '200.00', taxAmount: '14.00', totalAmount: '214.00' },
    ])
    expect(result.value.items[0]!.endsAt).toEqual(result.value.items[1]!.startsAt)
    expect((await operations.getAvailability(context(), { branchId, serviceIds: [serviceId],
      date: '2026-08-10', startTime: '11:00:00' })).ok).toBe(true)
    expect(await operations.getCalendar(context(), { branchId, date: '2026-08-10', view: 'DAY' }))
      .toMatchObject({ ok: true, value: [{ id: result.value.id }] })
  })

  it('rejects skill mismatch, working-hour violations, and pending time off', async () => {
    expect(await operations.create(context(), { customerId, source: 'PHONE', startsAt: '2026-08-10T09:00:00+07:00',
      items: [{ serviceId, employeeId: otherEmployeeId }] }))
      .toMatchObject({ ok: false, error: { code: 'BUSINESS_RULE_VIOLATION', message: 'No employee has all required skills' } })
    expect(await operations.create(context(), { customerId, source: 'PHONE', startsAt: '2026-08-10T18:00:00+07:00',
      items: [{ serviceId, employeeId }] }))
      .toMatchObject({ ok: false, error: { code: 'BUSINESS_RULE_VIOLATION', message: 'Booking is outside employee working hours' } })
    await database!.employeeTimeOff.create({ data: { employeeId, branchId,
      startsAt: new Date('2026-08-10T02:00:00.000Z'), endsAt: new Date('2026-08-10T03:00:00.000Z'), status: 'PENDING' } })
    expect(await operations.create(context(), { customerId, source: 'PHONE', startsAt: '2026-08-10T09:00:00+07:00',
      items: [{ serviceId, employeeId }] }))
      .toMatchObject({ ok: false, error: { code: 'BUSINESS_RULE_VIOLATION', message: 'Employee has overlapping time off' } })
  })

  it('prevents employee and customer double booking and conflicting reschedules', async () => {
    const first = await createBooking()
    expect(await operations.create(context(), { customerId: otherCustomerId, source: 'PHONE',
      startsAt: '2026-08-10T09:00:00+07:00', items: [{ serviceId, employeeId }] }))
      .toMatchObject({ ok: false, error: { code: 'BUSINESS_RULE_VIOLATION', message: 'Employee has an overlapping booking' } })
    expect(await operations.create(context(), { customerId, source: 'PHONE', startsAt: '2026-08-10T09:00:00+07:00',
      items: [{ serviceId: simpleServiceId, employeeId: otherEmployeeId }] }))
      .toMatchObject({ ok: false, error: { code: 'CONFLICT', message: 'Customer has an overlapping booking' } })
    await createBooking('2026-08-10T11:00:00+07:00', otherCustomerId)
    expect(await operations.reschedule(context(), first.id,
      { startsAt: '2026-08-10T11:00:00+07:00', reason: 'Customer requested' }))
      .toMatchObject({ ok: false, error: { code: 'BUSINESS_RULE_VIOLATION', message: 'Employee has an overlapping booking' } })
  })

  it('enforces status transitions and synchronizes booking item status', async () => {
    const booking = await createBooking()
    expect(await operations.complete(context(), booking.id))
      .toMatchObject({ ok: false, error: { code: 'BUSINESS_RULE_VIOLATION',
        message: 'Booking cannot transition from PENDING to COMPLETED' } })
    expect((await operations.confirm(context(), booking.id)).ok).toBe(true)
    expect((await operations.checkIn(context(), booking.id)).ok).toBe(true)
    expect(await operations.start(context(), booking.id))
      .toMatchObject({ ok: true, value: { status: 'IN_PROGRESS', items: [{ status: 'IN_SERVICE' }] } })
    expect(await operations.complete(context(), booking.id))
      .toMatchObject({ ok: true, value: { status: 'COMPLETED', items: [{ status: 'COMPLETED' }] } })
    const cancellable = await createBooking('2026-08-10T11:00:00+07:00')
    expect(await operations.cancel(context(), cancellable.id, { reason: 'Customer requested' }))
      .toMatchObject({ ok: true, value: { status: 'CANCELLED', cancellationReason: 'Customer requested',
        items: [{ status: 'CANCELLED' }] } })
  })

  it('soft-cancels removed items, compacts the schedule, and retains one active item', async () => {
    const created = await operations.create(context(), { customerId, source: 'WALK_IN',
      startsAt: '2026-08-10T12:00:00+07:00', items: [{ serviceId, employeeId },
        { serviceId: simpleServiceId, employeeId }] })
    expect(created.ok).toBe(true); if (!created.ok) return
    const removedItemId = created.value.items[0]!.id; const retainedItemId = created.value.items[1]!.id
    const removed = await operations.removeItem(context(), created.value.id, removedItemId)
    expect(removed.ok).toBe(true)
    if (!removed.ok) return
    expect(removed.value.items.find(({ id }) => id === removedItemId)?.status).toBe('CANCELLED')
    expect(removed.value.items.find(({ id }) => id === retainedItemId)?.status).toBe('SCHEDULED')
    expect(removed.value.startsAt.toISOString()).toBe('2026-08-10T05:00:00.000Z')
    expect(await operations.removeItem(context(), removed.value.id, retainedItemId))
      .toMatchObject({ ok: false, error: { code: 'BUSINESS_RULE_VIOLATION' } })
    expect(await database!.bookingItem.count({ where: { bookingId: created.value.id } })).toBe(2)
  })

  it('enforces organization and branch isolation on every read path', async () => {
    const booking = await createBooking()
    expect(await operations.get(context(otherBranchId, otherOrganizationId), booking.id))
      .toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } })
    expect(await operations.getAvailability(context(), { branchId: otherBranchId, serviceIds: [serviceId],
      date: '2026-08-10' })).toMatchObject({ ok: false, error: { code: 'TENANT_ISOLATION' } })
  })

  it('allows only one concurrent booking for the same employee and time', async () => {
    const input = (customer: string) => operations.create(context(), { customerId: customer, source: 'PHONE' as const,
      startsAt: '2026-08-10T15:00:00+07:00', items: [{ serviceId, employeeId }] })
    const results = await Promise.all([input(customerId), input(otherCustomerId)])
    expect(results.filter((result) => result.ok)).toHaveLength(1)
    expect(await database!.booking.count({ where: { branchId, startsAt: new Date('2026-08-10T08:00:00.000Z') } })).toBe(1)
  })

  it('rolls back booking and items after a technical transaction failure', async () => {
    const bookingId = randomUUID(); const itemId = randomUUID()
    await expect(transactions.withTransaction(async ({ bookings }) => {
      await bookings.createWithItems({ id: bookingId, branchId, customerId, createdByUserId: userId,
        bookingNumber: `BKG${bookingId.replaceAll('-', '').toUpperCase()}`, source: 'PHONE',
        startsAt: new Date('2026-08-10T09:00:00.000Z'), endsAt: new Date('2026-08-10T10:00:00.000Z'),
        customerNotes: null, internalNotes: null, items: [{ id: itemId, serviceId, employeeId,
          serviceName: 'Precision Cut', startsAt: new Date('2026-08-10T09:00:00.000Z'),
          endsAt: new Date('2026-08-10T10:00:00.000Z'), durationMinutes: 60, quantity: 1,
          unitPrice: '535.00', discountAmount: '0.00', subtotalAmount: '535.00', taxType: 'VAT',
          taxMode: 'INCLUDED', taxRate: '7.00', taxAmount: '35.00', totalAmount: '535.00', notes: null }] })
      throw new Error('technical rollback')
    })).rejects.toThrow('technical rollback')
    expect(await database!.booking.count({ where: { id: bookingId } })).toBe(0)
    expect(await database!.bookingItem.count({ where: { id: itemId } })).toBe(0)
  })
})
