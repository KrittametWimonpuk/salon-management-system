import { Prisma } from '@prisma/client'
import type {
  DashboardReportQuery,
  DashboardReportRepository,
  DashboardReportSnapshot,
  ReportCommissionPeriodStatus,
  ReportPaymentFact,
} from '../../application/foundation/dashboard-report-repository.js'
import type { PrismaDatabase } from './prisma-repositories.js'

const money = (value: Prisma.Decimal): string => value.toFixed(2)
const sumMoney = (values: readonly Prisma.Decimal[]): string => values
  .reduce((total, value) => total.add(value), new Prisma.Decimal(0)).toFixed(2)
const dateOnly = (value: Date | null): string | null => value?.toISOString().slice(0, 10) ?? null
const timeOnly = (value: Date): string => value.toISOString().slice(11, 19)

function strongestPeriodStatus(values: readonly ReportCommissionPeriodStatus[]): ReportCommissionPeriodStatus | null {
  if (values.includes('LOCKED')) return 'LOCKED'
  if (values.includes('APPROVED')) return 'APPROVED'
  return values.includes('OPEN') ? 'OPEN' : null
}

export class PrismaDashboardReportRepository implements DashboardReportRepository {
  constructor(private readonly database: PrismaDatabase) {}

  async loadSnapshot(query: DashboardReportQuery): Promise<DashboardReportSnapshot> {
    const branchWhere = {
      organizationId: query.organizationId,
      deletedAt: null,
      ...(query.branchIds === null ? {} : { id: { in: [...query.branchIds] } }),
    } satisfies Prisma.BranchWhereInput
    const itemFilter = {
      ...(query.employeeId ? { employeeId: query.employeeId } : {}),
      ...(query.serviceId ? { serviceId: query.serviceId } : {}),
    } satisfies Prisma.BookingItemWhereInput
    const bookingFilter = {
      branch: branchWhere,
      deletedAt: null,
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.employeeId || query.serviceId ? { items: { some: itemFilter } } : {}),
    } satisfies Prisma.BookingWhereInput
    const relatedBookingFilter = {
      branch: branchWhere,
      deletedAt: null,
      ...(query.employeeId || query.serviceId ? { items: { some: itemFilter } } : {}),
    } satisfies Prisma.BookingWhereInput
    const take = query.limit + 1
    const included = (item: { employeeId: string; serviceId: string }): boolean =>
      (!query.employeeId || item.employeeId === query.employeeId) && (!query.serviceId || item.serviceId === query.serviceId)

    const [salesRows, bookingRows, paymentRows, refundRows, commissionRows, adjustmentRows,
      customerRows, branchRows, employeeBranchRows, timeOffRows, holidayRows] = await Promise.all([
      this.database.booking.findMany({
        where: { ...bookingFilter, status: 'COMPLETED', saleClosedAt: { gte: query.dateFrom, lt: query.dateTo } },
        orderBy: [{ saleClosedAt: 'asc' }, { id: 'asc' }], take,
        select: {
          id: true, bookingNumber: true, customerId: true, status: true, paymentStatus: true,
          startsAt: true, saleClosedAt: true,
          branch: { select: { id: true, name: true } },
          customer: { select: { customerNumber: true, firstName: true, lastName: true } },
          items: {
            where: { status: { not: 'CANCELLED' } },
            select: { id: true, serviceId: true, serviceName: true, employeeId: true, status: true,
              durationMinutes: true, quantity: true, subtotalAmount: true, discountAmount: true,
              taxAmount: true, totalAmount: true, employee: { select: { displayName: true } } },
          },
          discounts: { select: { discountAmount: true } },
          payments: {
            select: { id: true, bookingId: true, method: true, status: true, amount: true, paidAt: true,
              voidedAt: true, refunds: { select: { amount: true } } },
          },
        },
      }),
      this.database.booking.findMany({
        where: { ...bookingFilter, startsAt: { gte: query.dateFrom, lt: query.dateTo } },
        orderBy: [{ startsAt: 'asc' }, { id: 'asc' }], take,
        select: { id: true, bookingNumber: true, customerId: true, status: true, paymentStatus: true,
          source: true, startsAt: true, completedAt: true, saleClosedAt: true,
          branch: { select: { id: true, name: true } },
          items: { where: itemFilter, select: { id: true, employeeId: true, serviceId: true,
            status: true, durationMinutes: true } },
        },
      }),
      this.database.payment.findMany({
        where: { booking: bookingFilter, paidAt: { gte: query.dateFrom, lt: query.dateTo } },
        orderBy: [{ paidAt: 'asc' }, { id: 'asc' }], take,
        select: { id: true, bookingId: true, method: true, status: true, amount: true, paidAt: true,
          voidedAt: true, booking: { select: { customerId: true, branch: { select: { id: true, name: true } },
            discounts: { select: { discountAmount: true } }, items: { where: { status: { not: 'CANCELLED' } },
              select: { id: true, serviceId: true, serviceName: true, employeeId: true,
                subtotalAmount: true, discountAmount: true } } } },
          refunds: { select: { amount: true } },
        },
      }),
      this.database.paymentRefund.findMany({
        where: { payment: { booking: bookingFilter }, createdAt: { gte: query.dateFrom, lt: query.dateTo } },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take,
        select: { id: true, paymentId: true, amount: true, createdAt: true,
          payment: { select: { bookingId: true, booking: { select: { customerId: true,
            branch: { select: { id: true, name: true } }, discounts: { select: { discountAmount: true } },
            items: { where: { status: { not: 'CANCELLED' } }, select: { id: true, serviceId: true,
              serviceName: true, employeeId: true, subtotalAmount: true, discountAmount: true } } } } } },
        },
      }),
      this.database.commissionHistory.findMany({
        where: { calculatedAt: { gte: query.dateFrom, lt: query.dateTo },
          ...(query.employeeId ? { employeeId: query.employeeId } : {}),
          bookingItem: { ...(query.serviceId ? { serviceId: query.serviceId } : {}), booking: bookingFilter } },
        orderBy: [{ calculatedAt: 'asc' }, { id: 'asc' }], take,
        select: { id: true, bookingItemId: true, employeeId: true, commissionAmount: true, calculatedAt: true,
          employee: { select: { displayName: true } },
          bookingItem: { select: { serviceId: true, serviceName: true,
            booking: { select: { id: true, branch: { select: { id: true, name: true } } } } } },
          approvals: { select: { approvedAmount: true, commissionPeriod: {
            select: { id: true, startsAt: true, endsAt: true, status: true } } } },
        },
      }),
      this.database.commissionAdjustment.findMany({
        where: { organizationId: query.organizationId,
          ...(query.branchIds === null ? {} : { branchId: { in: [...query.branchIds] } }),
          calculatedAt: { gte: query.dateFrom, lt: query.dateTo },
          ...(query.employeeId ? { employeeId: query.employeeId } : {}),
          ...(query.serviceId ? { bookingItem: { serviceId: query.serviceId } } : {}),
          ...(query.customerId ? { bookingItem: { booking: { customerId: query.customerId } } } : {}),
        },
        orderBy: [{ calculatedAt: 'asc' }, { id: 'asc' }], take,
        select: { id: true, bookingItemId: true, employeeId: true, adjustmentAmount: true, calculatedAt: true,
          branch: { select: { id: true, name: true } }, employee: { select: { displayName: true } },
          commissionPeriod: { select: { id: true, startsAt: true, endsAt: true, status: true } }, bookingItem: { select: { serviceId: true,
            serviceName: true, bookingId: true } },
        },
      }),
      this.database.customer.findMany({
        where: { organizationId: query.organizationId, deletedAt: null,
          ...(query.customerId ? { id: query.customerId } : {}),
          OR: [
            { createdAt: { gte: query.dateFrom, lt: query.dateTo },
              ...(query.branchIds === null ? {} : { preferredBranchId: { in: [...query.branchIds] } }) },
            { bookings: { some: { ...relatedBookingFilter, status: 'COMPLETED',
              saleClosedAt: { gte: query.dateFrom, lt: query.dateTo } } } },
          ],
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take,
        select: { id: true, customerNumber: true, firstName: true, lastName: true, preferredBranchId: true, createdAt: true },
      }),
      this.database.branch.findMany({ where: branchWhere, orderBy: { name: 'asc' }, take,
        select: { id: true, name: true, timezone: true, organization: { select: { timezone: true } } } }),
      this.database.employeeBranch.findMany({
        where: { branch: branchWhere, isActive: true, deletedAt: null,
          ...(query.employeeId ? { employeeId: query.employeeId } : {}) }, take,
        select: { branchId: true, employeeId: true, workingHours: { where: { isActive: true, deletedAt: null },
          select: { dayOfWeek: true, startTime: true, endTime: true, effectiveFrom: true, effectiveTo: true } } },
      }),
      this.database.employeeTimeOff.findMany({
        where: { employee: { organizationId: query.organizationId }, status: 'APPROVED', deletedAt: null,
          startsAt: { lt: query.dateTo }, endsAt: { gt: query.dateFrom },
          ...(query.employeeId ? { employeeId: query.employeeId } : {}),
          ...(query.branchIds === null ? {} : { OR: [{ branchId: null }, { branchId: { in: [...query.branchIds] } }] }) },
        take, select: { branchId: true, employeeId: true, startsAt: true, endsAt: true },
      }),
      this.database.holiday.findMany({ where: { branch: branchWhere, deletedAt: null, isClosed: true,
        startsAt: { lt: query.dateTo }, endsAt: { gt: query.dateFrom } }, take,
        select: { branchId: true, startsAt: true, endsAt: true } }),
    ])

    const bounded = <T>(values: readonly T[]): readonly T[] => values.slice(0, query.limit)
    const truncated = [salesRows, bookingRows, paymentRows, refundRows, commissionRows, adjustmentRows,
      customerRows, branchRows, employeeBranchRows, timeOffRows, holidayRows].some((rows) => rows.length > query.limit)
    const paymentFact = (row: typeof paymentRows[number]): ReportPaymentFact => ({
      id: row.id, bookingId: row.bookingId, branchId: row.booking.branch.id, branchName: row.booking.branch.name,
      customerId: row.booking.customerId, method: row.method, status: row.status, amount: money(row.amount),
      paidAt: row.paidAt, voidedAt: row.voidedAt, refundedAmount: sumMoney(row.refunds.map((item) => item.amount)),
      allocation: { bookingDiscountAmount: sumMoney(row.booking.discounts.map((item) => item.discountAmount)),
        items: row.booking.items.map((item) => ({ id: item.id, serviceId: item.serviceId,
          serviceName: item.serviceName, subtotalAmount: money(item.subtotalAmount),
          discountAmount: money(item.discountAmount), included: included(item) })) },
    })

    return {
      sales: bounded(salesRows).map((row) => ({
        id: row.id, bookingNumber: row.bookingNumber, branchId: row.branch.id, branchName: row.branch.name,
        customerId: row.customerId, customerNumber: row.customer.customerNumber,
        customerName: `${row.customer.firstName}${row.customer.lastName ? ` ${row.customer.lastName}` : ''}`,
        status: row.status, paymentStatus: row.paymentStatus, startsAt: row.startsAt, saleClosedAt: row.saleClosedAt!,
        items: row.items.map((item) => ({ id: item.id, serviceId: item.serviceId, serviceName: item.serviceName,
           employeeId: item.employeeId, employeeName: item.employee.displayName, status: item.status,
           durationMinutes: item.durationMinutes, quantity: item.quantity, subtotalAmount: money(item.subtotalAmount),
           discountAmount: money(item.discountAmount), taxAmount: money(item.taxAmount), totalAmount: money(item.totalAmount),
           included: included(item) })),
        bookingDiscountAmount: sumMoney(row.discounts.map((item) => item.discountAmount)),
        payments: row.payments.map((item) => ({ id: item.id, bookingId: item.bookingId,
          branchId: row.branch.id, branchName: row.branch.name, customerId: row.customerId, method: item.method,
          status: item.status, amount: money(item.amount), paidAt: item.paidAt, voidedAt: item.voidedAt,
          refundedAmount: sumMoney(item.refunds.map((refund) => refund.amount)) })),
      })),
      bookings: bounded(bookingRows).map((row) => ({ id: row.id, bookingNumber: row.bookingNumber,
        branchId: row.branch.id, branchName: row.branch.name, customerId: row.customerId, status: row.status,
        paymentStatus: row.paymentStatus, source: row.source, startsAt: row.startsAt, completedAt: row.completedAt,
        saleClosedAt: row.saleClosedAt, items: row.items })),
      payments: bounded(paymentRows).map(paymentFact),
      refunds: bounded(refundRows).map((row) => ({ id: row.id, paymentId: row.paymentId,
        bookingId: row.payment.bookingId, branchId: row.payment.booking.branch.id,
        branchName: row.payment.booking.branch.name, customerId: row.payment.booking.customerId,
        amount: money(row.amount), createdAt: row.createdAt,
        allocation: { bookingDiscountAmount: sumMoney(row.payment.booking.discounts.map((item) => item.discountAmount)),
          items: row.payment.booking.items.map((item) => ({ id: item.id, serviceId: item.serviceId,
            serviceName: item.serviceName, subtotalAmount: money(item.subtotalAmount),
            discountAmount: money(item.discountAmount), included: included(item) })) } })),
      commissions: bounded(commissionRows).map((row) => ({ id: row.id, branchId: row.bookingItem.booking.branch.id,
        branchName: row.bookingItem.booking.branch.name, bookingId: row.bookingItem.booking.id,
        bookingItemId: row.bookingItemId, employeeId: row.employeeId, employeeName: row.employee.displayName,
        serviceId: row.bookingItem.serviceId, serviceName: row.bookingItem.serviceName,
        commissionAmount: money(row.commissionAmount), calculatedAt: row.calculatedAt,
        periodStatus: strongestPeriodStatus(row.approvals.map((item) => item.commissionPeriod.status)),
        approvalPeriods: row.approvals.map((item) => ({ periodId: item.commissionPeriod.id,
          startsAt: item.commissionPeriod.startsAt, endsAt: item.commissionPeriod.endsAt,
          status: item.commissionPeriod.status, approvedAmount: money(item.approvedAmount) })) })),
      commissionAdjustments: bounded(adjustmentRows).map((row) => ({ id: row.id, branchId: row.branch.id,
        branchName: row.branch.name, bookingId: row.bookingItem.bookingId, bookingItemId: row.bookingItemId,
        employeeId: row.employeeId, employeeName: row.employee.displayName, serviceId: row.bookingItem.serviceId,
        serviceName: row.bookingItem.serviceName, adjustmentAmount: money(row.adjustmentAmount),
        calculatedAt: row.calculatedAt, periodId: row.commissionPeriod.id,
        periodStartsAt: row.commissionPeriod.startsAt, periodEndsAt: row.commissionPeriod.endsAt,
        periodStatus: row.commissionPeriod.status })),
      customers: bounded(customerRows).map((row) => ({ id: row.id, customerNumber: row.customerNumber,
        customerName: `${row.firstName}${row.lastName ? ` ${row.lastName}` : ''}`, createdAt: row.createdAt,
        createdInScope: query.branchIds === null || (row.preferredBranchId !== null && query.branchIds.includes(row.preferredBranchId)) })),
      branches: bounded(branchRows).map((row) => ({ id: row.id, name: row.name,
        timezone: row.timezone ?? row.organization.timezone })),
      workingHours: bounded(employeeBranchRows).flatMap((row) => row.workingHours.map((hour) => ({
        branchId: row.branchId, employeeId: row.employeeId, dayOfWeek: hour.dayOfWeek,
        startTime: timeOnly(hour.startTime), endTime: timeOnly(hour.endTime),
        effectiveFrom: dateOnly(hour.effectiveFrom), effectiveTo: dateOnly(hour.effectiveTo),
      }))),
      timeOffs: bounded(timeOffRows), holidays: bounded(holidayRows), truncated,
    }
  }
}
