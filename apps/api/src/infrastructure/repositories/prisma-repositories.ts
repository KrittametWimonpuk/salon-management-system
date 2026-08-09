import { Prisma, type PrismaClient } from '@prisma/client'
import type {
  BookingRecord,
  BookingRepository,
  BookingAvailabilityData,
  BookingCalendarQuery,
  BookingItemScheduleData,
  BookingItemSnapshotData,
  BookingListQuery,
  CreateBookingData,
  BranchServiceData,
  BranchServiceRecord,
  CatalogListQuery,
  CustomerRecord,
  CustomerListQuery,
  CustomerTagRecord,
  CreateCustomerData,
  CreateServiceCategoryData,
  CreateServiceData,
  CreateSkillData,
  CustomerRepository,
  EmployeeRecord,
  EmployeeRepository,
  EmployeeListQuery,
  EmployeeBranchRecord,
  WorkingHourRecord,
  WorkingHourData,
  UpdateWorkingHourData,
  EmployeeTimeOffData,
  EmployeeTimeOffRecord,
  CreateEmployeeData,
  UpdateEmployeeData,
  AssignEmployeeSkillData,
  PaymentRecord,
  PaymentRefundRecord,
  PaymentListQuery,
  CheckoutFinancialRecord,
  CreatePaymentData,
  CreatePaymentRefundData,
  PaymentRepository,
  Repository,
  RepositorySet,
  ServiceRecord,
  ServiceRepository,
  ServiceCategoryRecord,
  ServiceListQuery,
  ServiceSkillRecord,
  SkillRecord,
  TenantScope,
  UpdateCustomerData,
  UpdateBranchServiceData,
  UpdateBookingMetadataData,
  UpdateServiceCategoryData,
  UpdateServiceData,
  UpdateSkillData,
} from '../../application/foundation/repositories.js'
import { NotFoundError } from '../../domain/foundation/domain-errors.js'
import { failure, success, type Result } from '../../domain/foundation/result.js'
import { PrismaCommissionRepository } from './prisma-commission-repository.js'

export type PrismaDatabase = PrismaClient | Prisma.TransactionClient

abstract class PrismaReadRepository<TEntity> implements Repository<TEntity> {
  constructor(protected readonly database: PrismaDatabase) {}

  async findById(scope: TenantScope, id: string): Promise<Result<TEntity, NotFoundError>> {
    const record = await this.findScoped(scope, id)
    return record
      ? success(record)
      : failure(new NotFoundError('Resource was not found'))
  }

  protected abstract findScoped(scope: TenantScope, id: string): Promise<TEntity | null>
}

export class PrismaCustomerRepository extends PrismaReadRepository<CustomerRecord> implements CustomerRepository {
  protected async findScoped(scope: TenantScope, id: string): Promise<CustomerRecord | null> {
    return this.findCustomer({ id, organizationId: scope.organizationId, deletedAt: null })
  }

  async findByIdAnyStatus(scope: TenantScope, id: string): Promise<Result<CustomerRecord, NotFoundError>> {
    const customer = await this.findCustomer({ id, organizationId: scope.organizationId })
    return customer ? success(customer) : failure(new NotFoundError('Customer was not found'))
  }

  async findPage(scope: TenantScope, query: CustomerListQuery) {
    const where = this.buildWhere(scope, query)
    const orderBy = { [query.sort]: query.order }
    const [rows, totalItems] = await Promise.all([
      this.database.customer.findMany({
        where,
        select: customerSelect,
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.database.customer.count({ where }),
    ])
    return {
      items: rows.map(mapCustomer),
      page: query.page,
      pageSize: query.pageSize,
      totalItems,
      totalPages: Math.ceil(totalItems / query.pageSize),
    }
  }

  async acquirePhoneLock(scope: TenantScope, phone: string): Promise<void> {
    await this.database.$queryRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${scope.organizationId}:${phone}`}, 0)) IS NULL AS "acquired"`,
    )
  }

  async findActiveByPhone(
    scope: TenantScope,
    phone: string,
    excludeCustomerId?: string,
  ): Promise<CustomerRecord | null> {
    return this.findCustomer({
      organizationId: scope.organizationId,
      phone,
      deletedAt: null,
      ...(excludeCustomerId ? { id: { not: excludeCustomerId } } : {}),
    })
  }

  async create(data: CreateCustomerData): Promise<CustomerRecord> {
    const customer = await this.database.customer.create({
      data: { ...data, dateOfBirth: toDatabaseDate(data.dateOfBirth) },
      select: customerSelect,
    })
    return mapCustomer(customer)
  }

  async update(scope: TenantScope, id: string, data: UpdateCustomerData): Promise<CustomerRecord | null> {
    const persisted = {
      ...data,
      ...(data.dateOfBirth !== undefined ? { dateOfBirth: toDatabaseDate(data.dateOfBirth) } : {}),
    }
    const updated = await this.database.customer.updateMany({
      where: { id, organizationId: scope.organizationId, deletedAt: null },
      data: persisted,
    })
    return updated.count === 1 ? this.findCustomer({ id, organizationId: scope.organizationId, deletedAt: null }) : null
  }

  async archive(scope: TenantScope, id: string, archivedAt: Date): Promise<CustomerRecord | null> {
    const updated = await this.database.customer.updateMany({
      where: { id, organizationId: scope.organizationId, deletedAt: null },
      data: { deletedAt: archivedAt },
    })
    return updated.count === 1 ? this.findCustomer({ id, organizationId: scope.organizationId }) : null
  }

  async restore(scope: TenantScope, id: string): Promise<CustomerRecord | null> {
    const updated = await this.database.customer.updateMany({
      where: { id, organizationId: scope.organizationId, deletedAt: { not: null } },
      data: { deletedAt: null },
    })
    return updated.count === 1 ? this.findCustomer({ id, organizationId: scope.organizationId, deletedAt: null }) : null
  }

  async findActiveTag(scope: TenantScope, tagId: string): Promise<CustomerTagRecord | null> {
    return this.database.customerTag.findFirst({
      where: { id: tagId, organizationId: scope.organizationId, isActive: true, deletedAt: null },
      select: { id: true, name: true, color: true },
    })
  }

  async assignTag(scope: TenantScope, customerId: string, tagId: string): Promise<boolean> {
    const existing = await this.database.customerTagAssignment.findUnique({
      where: { customerId_tagId: { customerId, tagId } },
      select: { id: true, deletedAt: true, customer: { select: { organizationId: true, deletedAt: true } } },
    })
    if (existing && (existing.customer.organizationId !== scope.organizationId || existing.customer.deletedAt)) return false
    if (existing?.deletedAt === null) return false
    if (existing) {
      await this.database.customerTagAssignment.update({ where: { id: existing.id }, data: { deletedAt: null } })
    } else {
      await this.database.customerTagAssignment.create({ data: { customerId, tagId } })
    }
    return true
  }

  async removeTag(scope: TenantScope, customerId: string, tagId: string, removedAt: Date): Promise<boolean> {
    const removed = await this.database.customerTagAssignment.updateMany({
      where: {
        customerId,
        tagId,
        deletedAt: null,
        customer: { organizationId: scope.organizationId, deletedAt: null },
        tag: { organizationId: scope.organizationId, deletedAt: null },
      },
      data: { deletedAt: removedAt },
    })
    return removed.count === 1
  }

  private async findCustomer(where: Prisma.CustomerWhereInput): Promise<CustomerRecord | null> {
    const customer = await this.database.customer.findFirst({ where, select: customerSelect })
    return customer ? mapCustomer(customer) : null
  }

  private buildWhere(scope: TenantScope, query: CustomerListQuery): Prisma.CustomerWhereInput {
    const deletedAt = query.status === 'ACTIVE' ? null : query.status === 'ARCHIVED' ? { not: null } : undefined
    const tag = query.tagId
      ? { id: query.tagId }
      : query.tagName ? { name: { contains: query.tagName, mode: 'insensitive' as const } } : undefined
    return {
      organizationId: scope.organizationId,
      ...(deletedAt !== undefined ? { deletedAt } : {}),
      ...(query.keyword ? {
        OR: [
          { firstName: { contains: query.keyword, mode: 'insensitive' } },
          { lastName: { contains: query.keyword, mode: 'insensitive' } },
          { phone: { contains: query.keyword } },
        ],
      } : {}),
      ...(tag ? {
        tags: { some: { deletedAt: null, tag: { organizationId: scope.organizationId, isActive: true, deletedAt: null, ...tag } } },
      } : {}),
    }
  }
}

const customerSelect = {
  id: true,
  organizationId: true,
  preferredBranchId: true,
  customerNumber: true,
  firstName: true,
  lastName: true,
  phone: true,
  email: true,
  dateOfBirth: true,
  notes: true,
  lastVisitAt: true,
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
  tags: {
    where: { deletedAt: null, tag: { deletedAt: null, isActive: true } },
    select: { tag: { select: { id: true, name: true, color: true } } },
  },
} satisfies Prisma.CustomerSelect

type SelectedCustomer = Prisma.CustomerGetPayload<{ select: typeof customerSelect }>

function mapCustomer(customer: SelectedCustomer): CustomerRecord {
  return {
    ...customer,
    status: customer.deletedAt ? 'ARCHIVED' : 'ACTIVE',
    tags: customer.tags.map(({ tag }) => tag),
  }
}

function toDatabaseDate(value: string | null): Date | null {
  return value ? new Date(`${value}T00:00:00.000Z`) : null
}

export class PrismaEmployeeRepository extends PrismaReadRepository<EmployeeRecord> implements EmployeeRepository {
  protected async findScoped(scope: TenantScope, id: string): Promise<EmployeeRecord | null> {
    return this.findEmployee(this.employeeWhere(scope, { id, deletedAt: null }))
  }

  async findByIdAnyStatus(scope: TenantScope, id: string): Promise<Result<EmployeeRecord, NotFoundError>> {
    const employee = await this.findEmployee(this.employeeWhere(scope, { id }))
    return employee ? success(employee) : failure(new NotFoundError('Employee was not found'))
  }

  async findPage(scope: TenantScope, query: EmployeeListQuery) {
    const branchId = query.branchId ?? scope.branchId
    const where: Prisma.EmployeeWhereInput = {
      organizationId: scope.organizationId,
      ...(query.status === 'ARCHIVED' ? { deletedAt: { not: null } }
        : query.status === 'ALL' ? {}
          : { deletedAt: null, status: query.status }),
      ...(branchId ? { branchAssignments: { some: { branchId, isActive: true, deletedAt: null } } } : {}),
      ...(query.skillId ? { skills: { some: { skillId: query.skillId, deletedAt: null } } } : {}),
      ...(query.keyword ? { OR: [
        { displayName: { contains: query.keyword, mode: 'insensitive' } },
        { firstName: { contains: query.keyword, mode: 'insensitive' } },
        { lastName: { contains: query.keyword, mode: 'insensitive' } },
        { phone: { contains: query.keyword } },
      ] } : {}),
    }
    const [rows, totalItems] = await Promise.all([
      this.database.employee.findMany({
        where, select: employeeSelect, orderBy: { [query.sort]: query.order },
        skip: (query.page - 1) * query.pageSize, take: query.pageSize,
      }),
      this.database.employee.count({ where }),
    ])
    return {
      items: rows.map(mapEmployee), page: query.page, pageSize: query.pageSize, totalItems,
      totalPages: Math.ceil(totalItems / query.pageSize),
    }
  }

  async createWithPrimaryBranch(data: CreateEmployeeData, branchId: string, assignmentId: string): Promise<EmployeeRecord> {
    const employee = await this.database.employee.create({
      data: {
        ...data,
        hireDate: toDatabaseDate(data.hireDate),
        branchAssignments: { create: { id: assignmentId, branchId, isPrimary: true, isActive: true } },
      },
      select: employeeSelect,
    })
    return mapEmployee(employee)
  }

  async update(scope: TenantScope, id: string, data: UpdateEmployeeData): Promise<EmployeeRecord | null> {
    const { hireDate, ...changes } = data
    const updated = await this.database.employee.updateMany({
      where: this.employeeWhere(scope, { id, deletedAt: null }),
      data: { ...changes, ...(hireDate !== undefined ? { hireDate: toDatabaseDate(hireDate) } : {}) },
    })
    return updated.count ? this.findEmployee(this.employeeWhere(scope, { id, deletedAt: null })) : null
  }

  async archive(scope: TenantScope, id: string, archivedAt: Date): Promise<EmployeeRecord | null> {
    const updated = await this.database.employee.updateMany({
      where: this.employeeWhere(scope, { id, deletedAt: null }), data: { deletedAt: archivedAt },
    })
    return updated.count ? this.findEmployee(this.employeeWhere(scope, { id })) : null
  }

  async restore(scope: TenantScope, id: string): Promise<EmployeeRecord | null> {
    const updated = await this.database.employee.updateMany({
      where: this.employeeWhere(scope, { id, deletedAt: { not: null } }), data: { deletedAt: null },
    })
    return updated.count ? this.findEmployee(this.employeeWhere(scope, { id, deletedAt: null })) : null
  }

  async branchExists(scope: TenantScope, branchId: string): Promise<boolean> {
    return Boolean(await this.database.branch.findFirst({
      where: { id: branchId, organizationId: scope.organizationId, isActive: true, deletedAt: null }, select: { id: true },
    }))
  }

  async assignBranch(scope: TenantScope, employeeId: string, branchId: string, assignmentId: string): Promise<boolean> {
    const existing = await this.database.employeeBranch.findUnique({
      where: { employeeId_branchId: { employeeId, branchId } },
      select: { id: true, employee: { select: { organizationId: true, deletedAt: true } } },
    })
    if (existing && (existing.employee.organizationId !== scope.organizationId || existing.employee.deletedAt)) return false
    if (existing) {
      await this.database.employeeBranch.update({ where: { id: existing.id }, data: { deletedAt: null, isActive: true } })
    } else {
      await this.database.employeeBranch.create({ data: { id: assignmentId, employeeId, branchId } })
    }
    return true
  }

  async removeBranch(scope: TenantScope, employeeId: string, branchId: string, removedAt: Date): Promise<boolean> {
    const result = await this.database.employeeBranch.updateMany({
      where: { employeeId, branchId, isPrimary: false, isActive: true, deletedAt: null,
        employee: { organizationId: scope.organizationId, deletedAt: null }, branch: { organizationId: scope.organizationId } },
      data: { isActive: false, deletedAt: removedAt },
    })
    return result.count === 1
  }

  async setPrimaryBranch(scope: TenantScope, employeeId: string, branchId: string): Promise<boolean> {
    const target = await this.database.employeeBranch.findFirst({
      where: { employeeId, branchId, isActive: true, deletedAt: null,
        employee: { organizationId: scope.organizationId, deletedAt: null }, branch: { organizationId: scope.organizationId } },
      select: { id: true },
    })
    if (!target) return false
    await this.database.employeeBranch.updateMany({
      where: { employeeId, isPrimary: true, isActive: true, deletedAt: null }, data: { isPrimary: false },
    })
    await this.database.employeeBranch.update({ where: { id: target.id }, data: { isPrimary: true } })
    return true
  }

  async findActiveSkill(scope: TenantScope, skillId: string): Promise<boolean> {
    return Boolean(await this.database.skill.findFirst({
      where: { id: skillId, organizationId: scope.organizationId, isActive: true, deletedAt: null }, select: { id: true },
    }))
  }

  async assignSkill(scope: TenantScope, employeeId: string, data: AssignEmployeeSkillData): Promise<boolean> {
    const existing = await this.database.employeeSkill.findUnique({
      where: { employeeId_skillId: { employeeId, skillId: data.skillId } }, select: { id: true, deletedAt: true },
    })
    if (existing?.deletedAt === null) return false
    const values = {
      proficiencyLevel: data.proficiencyLevel,
      certifiedAt: toDatabaseDate(data.certifiedAt),
      expiresAt: toDatabaseDate(data.expiresAt),
      notes: data.notes,
      deletedAt: null,
    }
    if (existing) await this.database.employeeSkill.update({ where: { id: existing.id }, data: values })
    else await this.database.employeeSkill.create({ data: { id: data.id, employeeId, skillId: data.skillId, ...values } })
    return true
  }

  async removeSkill(scope: TenantScope, employeeId: string, skillId: string, removedAt: Date): Promise<boolean> {
    const result = await this.database.employeeSkill.updateMany({
      where: { employeeId, skillId, deletedAt: null, employee: { organizationId: scope.organizationId, deletedAt: null },
        skill: { organizationId: scope.organizationId } }, data: { deletedAt: removedAt },
    })
    return result.count === 1
  }

  async findEmployeeBranch(scope: TenantScope, employeeId: string, branchId: string): Promise<EmployeeBranchRecord | null> {
    const value = await this.database.employeeBranch.findFirst({
      where: { employeeId, branchId, isActive: true, deletedAt: null,
        employee: { organizationId: scope.organizationId }, branch: { organizationId: scope.organizationId, deletedAt: null } },
      select: { id: true, branchId: true, isPrimary: true, isActive: true, branch: { select: { name: true } } },
    })
    return value ? { id: value.id, branchId: value.branchId, branchName: value.branch.name,
      isPrimary: value.isPrimary, isActive: value.isActive } : null
  }

  async findWorkingHour(scope: TenantScope, employeeId: string, id: string): Promise<WorkingHourRecord | null> {
    if (!scope.branchId) return null
    const value = await this.database.workingHour.findFirst({
      where: { id, deletedAt: null, employeeBranch: { employeeId, branchId: scope.branchId,
        employee: { organizationId: scope.organizationId }, branch: { organizationId: scope.organizationId } } },
      select: workingHourSelect,
    })
    return value ? mapWorkingHour(value) : null
  }

  async hasWorkingHourOverlap(scope: TenantScope, employeeId: string, data: Omit<WorkingHourData, 'id'>, excludeId?: string): Promise<boolean> {
    if (!scope.branchId) return false
    const startTime = toDatabaseTime(data.startTime)
    const endTime = toDatabaseTime(data.endTime)
    const effectiveFrom = toDatabaseDate(data.effectiveFrom)
    const effectiveTo = toDatabaseDate(data.effectiveTo)
    return Boolean(await this.database.workingHour.findFirst({
      where: {
        employeeBranchId: data.employeeBranchId, dayOfWeek: data.dayOfWeek, isActive: true, deletedAt: null,
        ...(excludeId ? { id: { not: excludeId } } : {}),
        startTime: { lt: endTime }, endTime: { gt: startTime },
        AND: [
          { OR: [{ effectiveTo: null }, ...(effectiveFrom ? [{ effectiveTo: { gte: effectiveFrom } }] : [])] },
          ...(effectiveTo ? [{ OR: [{ effectiveFrom: null }, { effectiveFrom: { lte: effectiveTo } }] }] : []),
        ],
        employeeBranch: { employeeId, branchId: scope.branchId, employee: { organizationId: scope.organizationId } },
      }, select: { id: true },
    }))
  }

  async createWorkingHour(scope: TenantScope, employeeId: string, data: WorkingHourData): Promise<WorkingHourRecord | null> {
    if (!await this.findEmployeeBranch(scope, employeeId, scope.branchId ?? '')) return null
    const value = await this.database.workingHour.create({ data: persistWorkingHour(data), select: workingHourSelect })
    return mapWorkingHour(value)
  }

  async updateWorkingHour(scope: TenantScope, employeeId: string, id: string, data: UpdateWorkingHourData): Promise<WorkingHourRecord | null> {
    const existing = await this.findWorkingHour(scope, employeeId, id)
    if (!existing) return null
    const persisted = {
      ...data,
      ...(data.startTime ? { startTime: toDatabaseTime(data.startTime) } : {}),
      ...(data.endTime ? { endTime: toDatabaseTime(data.endTime) } : {}),
      ...(data.effectiveFrom !== undefined ? { effectiveFrom: toDatabaseDate(data.effectiveFrom) } : {}),
      ...(data.effectiveTo !== undefined ? { effectiveTo: toDatabaseDate(data.effectiveTo) } : {}),
    }
    const value = await this.database.workingHour.update({ where: { id }, data: persisted, select: workingHourSelect })
    return mapWorkingHour(value)
  }

  async removeWorkingHour(scope: TenantScope, employeeId: string, id: string, removedAt: Date): Promise<boolean> {
    if (!await this.findWorkingHour(scope, employeeId, id)) return false
    await this.database.workingHour.update({ where: { id }, data: { isActive: false, deletedAt: removedAt } })
    return true
  }

  async createTimeOff(scope: TenantScope, data: EmployeeTimeOffData): Promise<EmployeeTimeOffRecord> {
    return this.database.employeeTimeOff.create({
      data: { ...data, startsAt: new Date(data.startsAt), endsAt: new Date(data.endsAt) },
      select: timeOffSelect,
    })
  }

  async cancelTimeOff(scope: TenantScope, employeeId: string, id: string): Promise<EmployeeTimeOffRecord | null> {
    const result = await this.database.employeeTimeOff.updateMany({
      where: { id, employeeId, status: { in: ['PENDING', 'APPROVED'] }, deletedAt: null,
        employee: { organizationId: scope.organizationId }, ...(scope.branchId ? { OR: [{ branchId: scope.branchId }, { branchId: null }] } : {}) },
      data: { status: 'CANCELLED' },
    })
    return result.count ? this.database.employeeTimeOff.findUnique({ where: { id }, select: timeOffSelect }) : null
  }

  private employeeWhere(scope: TenantScope, extra: Prisma.EmployeeWhereInput): Prisma.EmployeeWhereInput {
    return { organizationId: scope.organizationId, ...extra,
      ...(scope.branchId ? { branchAssignments: { some: { branchId: scope.branchId, isActive: true, deletedAt: null } } } : {}) }
  }

  private async findEmployee(where: Prisma.EmployeeWhereInput): Promise<EmployeeRecord | null> {
    const employee = await this.database.employee.findFirst({ where, select: employeeSelect })
    return employee ? mapEmployee(employee) : null
  }
}

const employeeSelect = {
  id: true, organizationId: true, userId: true, employeeCode: true, displayName: true,
  firstName: true, lastName: true, phone: true, email: true, hireDate: true, status: true,
  deletedAt: true, createdAt: true, updatedAt: true,
  branchAssignments: { where: { isActive: true, deletedAt: null },
    select: { id: true, branchId: true, isPrimary: true, isActive: true, branch: { select: { name: true } } } },
  skills: { where: { deletedAt: null }, select: { id: true, skillId: true, proficiencyLevel: true,
    certifiedAt: true, expiresAt: true, notes: true, skill: { select: { name: true } } } },
} satisfies Prisma.EmployeeSelect

type SelectedEmployee = Prisma.EmployeeGetPayload<{ select: typeof employeeSelect }>

function mapEmployee(employee: SelectedEmployee): EmployeeRecord {
  return {
    ...employee,
    employmentStatus: employee.status,
    status: employee.deletedAt ? 'ARCHIVED' : employee.status,
    branches: employee.branchAssignments.map((item) => ({ id: item.id, branchId: item.branchId,
      branchName: item.branch.name, isPrimary: item.isPrimary, isActive: item.isActive })),
    skills: employee.skills.map((item) => ({ id: item.id, skillId: item.skillId, skillName: item.skill.name,
      proficiencyLevel: item.proficiencyLevel, certifiedAt: item.certifiedAt, expiresAt: item.expiresAt, notes: item.notes })),
  }
}

const workingHourSelect = { id: true, employeeBranchId: true, dayOfWeek: true, startTime: true,
  endTime: true, effectiveFrom: true, effectiveTo: true, isActive: true,
  employeeBranch: { select: { branchId: true } } } satisfies Prisma.WorkingHourSelect
type SelectedWorkingHour = Prisma.WorkingHourGetPayload<{ select: typeof workingHourSelect }>

function mapWorkingHour(value: SelectedWorkingHour): WorkingHourRecord {
  return { id: value.id, employeeBranchId: value.employeeBranchId, branchId: value.employeeBranch.branchId,
    dayOfWeek: value.dayOfWeek, startTime: value.startTime.toISOString().slice(11, 19),
    endTime: value.endTime.toISOString().slice(11, 19), effectiveFrom: value.effectiveFrom,
    effectiveTo: value.effectiveTo, isActive: value.isActive }
}

function persistWorkingHour(data: WorkingHourData) {
  return { ...data, startTime: toDatabaseTime(data.startTime), endTime: toDatabaseTime(data.endTime),
    effectiveFrom: toDatabaseDate(data.effectiveFrom), effectiveTo: toDatabaseDate(data.effectiveTo) }
}

function toDatabaseTime(value: string): Date {
  return new Date(`1970-01-01T${value}Z`)
}

const timeOffSelect = { id: true, employeeId: true, branchId: true, startsAt: true, endsAt: true,
  status: true, reason: true } satisfies Prisma.EmployeeTimeOffSelect

export class PrismaBookingRepository extends PrismaReadRepository<BookingRecord> implements BookingRepository {
  protected async findScoped(scope: TenantScope, id: string): Promise<BookingRecord | null> {
    return this.findBooking(this.bookingWhere(scope, { id, deletedAt: null }))
  }

  async findByIdAnyStatus(scope: TenantScope, id: string) {
    const value = await this.findBooking(this.bookingWhere(scope, { id }))
    return value ? success(value) : failure(new NotFoundError('Booking was not found'))
  }

  async findPage(scope: TenantScope, query: BookingListQuery) {
    const where: Prisma.BookingWhereInput = this.bookingWhere(scope, { branchId: query.branchId, deletedAt: null,
      ...(query.customerId ? { customerId: query.customerId } : {}), ...(query.status ? { status: query.status } : {}),
      ...(query.dateFrom || query.dateTo ? { startsAt: { ...(query.dateFrom ? { gte: query.dateFrom } : {}),
        ...(query.dateTo ? { lt: query.dateTo } : {}) } } : {}),
      ...(query.employeeId ? { items: { some: { employeeId: query.employeeId, status: { not: 'CANCELLED' } } } } : {}),
      ...(query.serviceId ? { items: { some: { serviceId: query.serviceId, status: { not: 'CANCELLED' } } } } : {}),
      ...(query.keyword ? { OR: [
        { bookingNumber: { contains: query.keyword, mode: 'insensitive' } },
        { customer: { firstName: { contains: query.keyword, mode: 'insensitive' } } },
        { customer: { lastName: { contains: query.keyword, mode: 'insensitive' } } },
        { customer: { phone: { contains: query.keyword } } },
        { items: { some: { employee: { displayName: { contains: query.keyword, mode: 'insensitive' } } } } },
        { items: { some: { serviceName: { contains: query.keyword, mode: 'insensitive' } } } },
      ] } : {}) })
    const [rows, totalItems] = await Promise.all([
      this.database.booking.findMany({ where, select: bookingSelect, orderBy: { [query.sort]: query.order },
        skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      this.database.booking.count({ where }),
    ])
    return page(rows.map(mapBooking), query, totalItems)
  }

  async findCalendar(scope: TenantScope, query: BookingCalendarQuery) {
    const rows = await this.database.booking.findMany({ where: this.bookingWhere(scope, { branchId: query.branchId,
      deletedAt: null, startsAt: { lt: query.endsAt }, endsAt: { gt: query.startsAt },
      ...(query.employeeId ? { items: { some: { employeeId: query.employeeId, status: { not: 'CANCELLED' } } } } : {}) }),
    select: bookingSelect, orderBy: { startsAt: 'asc' } })
    return rows.map(mapBooking)
  }

  async loadAvailabilityData(scope: TenantScope, branchId: string, serviceIds: readonly string[],
    rangeStart: Date, rangeEnd: Date, excludeBookingId?: string): Promise<BookingAvailabilityData | null> {
    const branch = await this.database.branch.findFirst({ where: { id: branchId, organizationId: scope.organizationId,
      isActive: true, deletedAt: null, organization: { deletedAt: null } },
    select: { id: true, name: true, timezone: true, organization: { select: { timezone: true } } } })
    if (!branch) return null
    const settings = await this.database.setting.findMany({ where: { organizationId: scope.organizationId,
      key: { equals: 'booking.slot_interval_minutes', mode: 'insensitive' }, deletedAt: null,
      OR: [{ branchId }, { branchId: null }] }, select: { branchId: true, value: true } })
    const branchSetting = settings.find((value) => value.branchId === branchId) ?? settings.find((value) => value.branchId === null)
    const interval = typeof branchSetting?.value === 'number' ? branchSetting.value : null
    const branchServices = await this.database.branchService.findMany({ where: { branchId, isActive: true,
      deletedAt: null, serviceId: { in: [...serviceIds] }, service: { organizationId: scope.organizationId,
        isActive: true, deletedAt: null } }, select: { priceOverride: true, durationOverrideMinutes: true,
        service: { select: { id: true, name: true, durationMinutes: true, price: true, taxType: true,
          taxMode: true, taxRate: true, requiredSkills: { select: { skillId: true, requiredLevel: true } } } } } })
    const employees = await this.database.employee.findMany({ where: { organizationId: scope.organizationId,
      status: 'ACTIVE', deletedAt: null, branchAssignments: { some: { branchId, isActive: true, deletedAt: null } } },
    select: { id: true, displayName: true, skills: { where: { deletedAt: null },
      select: { skillId: true, proficiencyLevel: true } }, branchAssignments: { where: { branchId, isActive: true,
        deletedAt: null }, select: { workingHours: { where: { isActive: true, deletedAt: null },
          select: { dayOfWeek: true, startTime: true, endTime: true, effectiveFrom: true, effectiveTo: true } } } },
      timeOffs: { where: { deletedAt: null, status: { in: ['PENDING', 'APPROVED'] },
        startsAt: { lt: rangeEnd }, endsAt: { gt: rangeStart }, OR: [{ branchId }, { branchId: null }] },
        select: { startsAt: true, endsAt: true } },
      bookingItems: { where: { status: { in: ['SCHEDULED', 'IN_SERVICE'] }, startsAt: { lt: rangeEnd },
        endsAt: { gt: rangeStart }, booking: { deletedAt: null, status: { in: ['PENDING', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS'] },
          ...(excludeBookingId ? { id: { not: excludeBookingId } } : {}) } },
        select: { bookingId: true, startsAt: true, endsAt: true } } } })
    const holidays = await this.database.holiday.findMany({ where: { branchId, isClosed: true, deletedAt: null,
      startsAt: { lt: rangeEnd }, endsAt: { gt: rangeStart } }, select: { startsAt: true, endsAt: true } })
    return { branchId: branch.id, branchName: branch.name, timezone: branch.timezone ?? branch.organization.timezone,
      slotIntervalMinutes: Number.isInteger(interval) ? interval : null,
      services: branchServices.map(({ service, priceOverride, durationOverrideMinutes }) => ({ id: service.id,
        name: service.name, durationMinutes: durationOverrideMinutes ?? service.durationMinutes,
        effectivePrice: (priceOverride ?? service.price).toFixed(2), taxType: service.taxType,
        taxMode: service.taxMode, taxRate: service.taxRate.toFixed(2), requiredSkills: service.requiredSkills })),
      employees: employees.map((employee) => ({ id: employee.id, displayName: employee.displayName,
        skills: employee.skills, workingHours: employee.branchAssignments.flatMap(({ workingHours }) => workingHours.map((hour) => ({
          dayOfWeek: hour.dayOfWeek, startTime: hour.startTime.toISOString().slice(11, 19),
          endTime: hour.endTime.toISOString().slice(11, 19), effectiveFrom: hour.effectiveFrom?.toISOString().slice(0, 10) ?? null,
          effectiveTo: hour.effectiveTo?.toISOString().slice(0, 10) ?? null }))), timeOffs: employee.timeOffs,
        blocks: employee.bookingItems })), holidays }
  }

  async findActiveCustomer(scope: TenantScope, customerId: string) {
    return await this.database.customer.count({ where: { id: customerId, organizationId: scope.organizationId,
      deletedAt: null } }) === 1
  }

  async acquireBookingLocks(scope: TenantScope, keys: readonly string[]) {
    for (const key of [...new Set(keys)].sort()) {
      await this.database.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${scope.organizationId}:${key}`}, 0)) IS NULL AS "acquired"`)
    }
  }

  async hasCustomerConflict(scope: TenantScope, customerId: string, startsAt: Date, endsAt: Date,
    excludeBookingId?: string) {
    return await this.database.booking.count({ where: { customerId, deletedAt: null,
      branch: { organizationId: scope.organizationId }, status: { in: ['PENDING', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS'] },
      startsAt: { lt: endsAt }, endsAt: { gt: startsAt }, ...(excludeBookingId ? { id: { not: excludeBookingId } } : {}) } }) > 0
  }

  async createWithItems(data: CreateBookingData) {
    const { items, ...booking } = data
    return mapBooking(await this.database.booking.create({ data: { ...booking, items: { create: items.map(persistBookingItem) } },
      select: bookingSelect }))
  }

  async updateMetadata(scope: TenantScope, id: string, data: UpdateBookingMetadataData) {
    const result = await this.database.booking.updateMany({ where: this.bookingWhere(scope, { id, deletedAt: null }), data })
    return result.count ? this.findBooking(this.bookingWhere(scope, { id, deletedAt: null })) : null
  }

  async updateSchedule(scope: TenantScope, id: string, startsAt: Date, endsAt: Date,
    items: readonly BookingItemScheduleData[]) {
    const booking = await this.findBooking(this.bookingWhere(scope, { id, deletedAt: null }))
    if (!booking) return null
    await this.database.booking.update({ where: { id }, data: { startsAt, endsAt } })
    for (const item of items) await this.database.bookingItem.updateMany({ where: { id: item.id, bookingId: id,
      status: { not: 'CANCELLED' } }, data: { employeeId: item.employeeId, startsAt: item.startsAt, endsAt: item.endsAt } })
    return this.findBooking(this.bookingWhere(scope, { id, deletedAt: null }))
  }

  async transitionStatus(scope: TenantScope, id: string, from: BookingRecord['status'], to: BookingRecord['status'],
    changedAt: Date, reason?: string) {
    const result = await this.database.booking.updateMany({ where: this.bookingWhere(scope, { id, status: from,
      deletedAt: null }), data: { status: to, ...(to === 'CANCELLED' ? { cancelledAt: changedAt,
        cancellationReason: reason ?? null } : {}), ...(to === 'COMPLETED' ? { completedAt: changedAt } : {}) } })
    if (!result.count) return null
    const itemStatus = to === 'IN_PROGRESS' ? 'IN_SERVICE' : to === 'COMPLETED' ? 'COMPLETED'
      : to === 'CANCELLED' || to === 'NO_SHOW' ? 'CANCELLED' : null
    if (itemStatus) await this.database.bookingItem.updateMany({ where: { bookingId: id,
      status: { in: ['SCHEDULED', 'IN_SERVICE'] } }, data: { status: itemStatus } })
    return this.findBooking(this.bookingWhere(scope, { id, deletedAt: null }))
  }

  async addItem(scope: TenantScope, bookingId: string, bookingEndsAt: Date, item: BookingItemSnapshotData) {
    const booking = await this.findBooking(this.bookingWhere(scope, { id: bookingId, deletedAt: null }))
    if (!booking) return null
    await this.database.booking.update({ where: { id: bookingId }, data: { endsAt: bookingEndsAt,
      items: { create: persistBookingItem(item) } } })
    return this.findBooking(this.bookingWhere(scope, { id: bookingId, deletedAt: null }))
  }

  async updateItem(scope: TenantScope, bookingId: string, itemId: string, item: BookingItemSnapshotData,
    bookingEndsAt: Date, following: readonly BookingItemScheduleData[]) {
    const booking = await this.findBooking(this.bookingWhere(scope, { id: bookingId, deletedAt: null }))
    if (!booking) return null
    const data = persistBookingItemValues(item)
    const updated = await this.database.bookingItem.updateMany({ where: { id: itemId, bookingId,
      status: { not: 'CANCELLED' } }, data })
    if (!updated.count) return null
    for (const next of following) await this.database.bookingItem.update({ where: { id: next.id },
      data: { startsAt: next.startsAt, endsAt: next.endsAt } })
    await this.database.booking.update({ where: { id: bookingId }, data: { endsAt: bookingEndsAt } })
    return this.findBooking(this.bookingWhere(scope, { id: bookingId, deletedAt: null }))
  }

  async cancelItem(scope: TenantScope, bookingId: string, itemId: string, bookingStartsAt: Date, bookingEndsAt: Date,
    following: readonly BookingItemScheduleData[]) {
    const booking = await this.findBooking(this.bookingWhere(scope, { id: bookingId, deletedAt: null }))
    if (!booking) return null
    const cancelled = await this.database.bookingItem.updateMany({ where: { id: itemId, bookingId,
      status: { not: 'CANCELLED' } }, data: { status: 'CANCELLED' } })
    if (!cancelled.count) return null
    for (const next of following) await this.database.bookingItem.update({ where: { id: next.id },
      data: { startsAt: next.startsAt, endsAt: next.endsAt } })
    await this.database.booking.update({ where: { id: bookingId }, data: { startsAt: bookingStartsAt, endsAt: bookingEndsAt } })
    return this.findBooking(this.bookingWhere(scope, { id: bookingId, deletedAt: null }))
  }

  private bookingWhere(scope: TenantScope, input: Prisma.BookingWhereInput): Prisma.BookingWhereInput {
    return { ...input, branch: { organizationId: scope.organizationId,
      ...(scope.branchId ? { id: scope.branchId } : {}) } }
  }

  private async findBooking(where: Prisma.BookingWhereInput) {
    const value = await this.database.booking.findFirst({ where, select: bookingSelect })
    return value ? mapBooking(value) : null
  }
}

const bookingItemSelect = { id: true, bookingId: true, serviceId: true, employeeId: true, serviceName: true,
  status: true, startsAt: true, endsAt: true, durationMinutes: true, quantity: true, unitPrice: true,
  discountAmount: true, subtotalAmount: true, taxType: true, taxMode: true, taxRate: true, taxAmount: true,
  totalAmount: true, notes: true, createdAt: true, updatedAt: true,
  employee: { select: { displayName: true } } } satisfies Prisma.BookingItemSelect
const bookingSelect = { id: true, branchId: true, customerId: true, createdByUserId: true, bookingNumber: true,
  status: true, source: true, startsAt: true, endsAt: true, customerNotes: true, internalNotes: true,
  cancellationReason: true, cancelledAt: true, completedAt: true, paymentStatus: true, saleClosedAt: true,
  closedByUserId: true, deletedAt: true, createdAt: true, updatedAt: true,
  branch: { select: { name: true } }, customer: { select: { firstName: true, lastName: true, phone: true } },
  items: { select: bookingItemSelect, orderBy: [{ startsAt: 'asc' }, { id: 'asc' }] } } satisfies Prisma.BookingSelect
type SelectedBooking = Prisma.BookingGetPayload<{ select: typeof bookingSelect }>

function mapBookingItem(value: SelectedBooking['items'][number]) {
  return { id: value.id, bookingId: value.bookingId, serviceId: value.serviceId, employeeId: value.employeeId,
    employeeName: value.employee.displayName, serviceName: value.serviceName, status: value.status,
    startsAt: value.startsAt, endsAt: value.endsAt, durationMinutes: value.durationMinutes, quantity: value.quantity,
    unitPrice: value.unitPrice.toFixed(2), discountAmount: value.discountAmount.toFixed(2),
    subtotalAmount: value.subtotalAmount.toFixed(2), taxType: value.taxType, taxMode: value.taxMode,
    taxRate: value.taxRate.toFixed(2), taxAmount: value.taxAmount.toFixed(2), totalAmount: value.totalAmount.toFixed(2),
    notes: value.notes, createdAt: value.createdAt, updatedAt: value.updatedAt }
}

function mapBooking(value: SelectedBooking): BookingRecord {
  const items = value.items.map(mapBookingItem)
  const active = items.filter((item) => item.status !== 'CANCELLED')
  const sum = (field: 'subtotalAmount' | 'taxAmount' | 'totalAmount') => active.reduce(
    (total, item) => total.plus(item[field]), new Prisma.Decimal(0)).toFixed(2)
  return { id: value.id, branchId: value.branchId, branchName: value.branch.name, customerId: value.customerId,
    customerName: [value.customer.firstName, value.customer.lastName].filter(Boolean).join(' '),
    customerPhone: value.customer.phone, createdByUserId: value.createdByUserId, bookingNumber: value.bookingNumber,
    status: value.status, source: value.source, startsAt: value.startsAt, endsAt: value.endsAt,
    customerNotes: value.customerNotes, internalNotes: value.internalNotes, cancellationReason: value.cancellationReason,
    cancelledAt: value.cancelledAt, completedAt: value.completedAt, paymentStatus: value.paymentStatus,
    saleClosedAt: value.saleClosedAt, closedByUserId: value.closedByUserId, deletedAt: value.deletedAt, items,
    subtotalAmount: sum('subtotalAmount'), taxAmount: sum('taxAmount'), totalAmount: sum('totalAmount'),
    createdAt: value.createdAt, updatedAt: value.updatedAt }
}

function persistBookingItem(item: BookingItemSnapshotData) {
  return { id: item.id, ...persistBookingItemValues(item) }
}

function persistBookingItemValues(item: BookingItemSnapshotData) {
  return { serviceId: item.serviceId, employeeId: item.employeeId, serviceName: item.serviceName,
    startsAt: item.startsAt, endsAt: item.endsAt, durationMinutes: item.durationMinutes, quantity: item.quantity,
    unitPrice: item.unitPrice, discountAmount: item.discountAmount, subtotalAmount: item.subtotalAmount,
    taxType: item.taxType, taxMode: item.taxMode, taxRate: item.taxRate, taxAmount: item.taxAmount,
    totalAmount: item.totalAmount, notes: item.notes }
}

export class PrismaServiceRepository extends PrismaReadRepository<ServiceRecord> implements ServiceRepository {
  protected async findScoped(scope: TenantScope, id: string): Promise<ServiceRecord | null> {
    return this.findService({ id, organizationId: scope.organizationId, deletedAt: null })
  }

  async acquireCatalogLock(scope: TenantScope, key: string): Promise<void> {
    await this.database.$queryRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${scope.organizationId}:${key.toLowerCase()}`}, 0)) IS NULL AS "acquired"`,
    )
  }

  async findCategoryById(scope: TenantScope, id: string) {
    return this.categoryResult({ id, organizationId: scope.organizationId, deletedAt: null })
  }

  async findCategoryByIdAnyStatus(scope: TenantScope, id: string) {
    return this.categoryResult({ id, organizationId: scope.organizationId })
  }

  async findCategoryPage(scope: TenantScope, query: CatalogListQuery) {
    const where: Prisma.ServiceCategoryWhereInput = {
      organizationId: scope.organizationId,
      ...catalogStatusWhere(query.status),
      ...(query.keyword ? { name: { contains: query.keyword, mode: 'insensitive' } } : {}),
    }
    const [rows, totalItems] = await Promise.all([
      this.database.serviceCategory.findMany({ where, select: serviceCategorySelect,
        orderBy: { [query.sort]: query.order }, skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      this.database.serviceCategory.count({ where }),
    ])
    return page(rows.map(mapServiceCategory), query, totalItems)
  }

  async findActiveCategoryByName(scope: TenantScope, name: string, excludeId?: string) {
    const value = await this.database.serviceCategory.findFirst({ where: { organizationId: scope.organizationId,
      name: { equals: name, mode: 'insensitive' }, deletedAt: null, ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: serviceCategorySelect })
    return value ? mapServiceCategory(value) : null
  }

  async createCategory(data: CreateServiceCategoryData) {
    return mapServiceCategory(await this.database.serviceCategory.create({ data, select: serviceCategorySelect }))
  }

  async updateCategory(scope: TenantScope, id: string, data: UpdateServiceCategoryData) {
    const result = await this.database.serviceCategory.updateMany({ where: { id, organizationId: scope.organizationId,
      deletedAt: null }, data })
    return result.count ? this.category({ id, organizationId: scope.organizationId, deletedAt: null }) : null
  }

  async archiveCategory(scope: TenantScope, id: string, archivedAt: Date) {
    const result = await this.database.serviceCategory.updateMany({ where: { id, organizationId: scope.organizationId,
      deletedAt: null }, data: { isActive: false, deletedAt: archivedAt } })
    return result.count ? this.category({ id, organizationId: scope.organizationId }) : null
  }

  async restoreCategory(scope: TenantScope, id: string) {
    const result = await this.database.serviceCategory.updateMany({ where: { id, organizationId: scope.organizationId,
      deletedAt: { not: null } }, data: { isActive: true, deletedAt: null } })
    return result.count ? this.category({ id, organizationId: scope.organizationId, deletedAt: null }) : null
  }

  async findByIdAnyStatus(scope: TenantScope, id: string) {
    const service = await this.findService({ id, organizationId: scope.organizationId })
    return service ? success(service) : failure(new NotFoundError('Service was not found'))
  }

  async findPage(scope: TenantScope, query: ServiceListQuery) {
    const where: Prisma.ServiceWhereInput = {
      organizationId: scope.organizationId,
      ...catalogStatusWhere(query.status),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.branchId ? { branchServices: { some: { branchId: query.branchId, isActive: true, deletedAt: null,
        branch: { organizationId: scope.organizationId, deletedAt: null } } } } : {}),
      ...(query.skillId ? { requiredSkills: { some: { skillId: query.skillId,
        skill: { organizationId: scope.organizationId, deletedAt: null } } } } : {}),
      ...(query.keyword ? { OR: [
        { name: { contains: query.keyword, mode: 'insensitive' } },
        { category: { name: { contains: query.keyword, mode: 'insensitive' } } },
        { branchServices: { some: { deletedAt: null, branch: { name: { contains: query.keyword, mode: 'insensitive' } } } } },
        { requiredSkills: { some: { skill: { name: { contains: query.keyword, mode: 'insensitive' } } } } },
      ] } : {}),
    }
    const [rows, totalItems] = await Promise.all([
      this.database.service.findMany({ where, select: serviceSelect, orderBy: { [query.sort]: query.order },
        skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      this.database.service.count({ where }),
    ])
    return page(rows.map(mapService), query, totalItems)
  }

  async findActiveByName(scope: TenantScope, name: string, excludeId?: string) {
    return this.findService({ organizationId: scope.organizationId, name: { equals: name, mode: 'insensitive' },
      deletedAt: null, ...(excludeId ? { id: { not: excludeId } } : {}) })
  }

  async findActiveByCode(scope: TenantScope, code: string, excludeId?: string) {
    return this.findService({ organizationId: scope.organizationId, code: { equals: code, mode: 'insensitive' },
      deletedAt: null, ...(excludeId ? { id: { not: excludeId } } : {}) })
  }

  async create(data: CreateServiceData) {
    return mapService(await this.database.service.create({ data, select: serviceSelect }))
  }

  async update(scope: TenantScope, id: string, data: UpdateServiceData) {
    const result = await this.database.service.updateMany({ where: { id, organizationId: scope.organizationId,
      deletedAt: null }, data })
    return result.count ? this.findService({ id, organizationId: scope.organizationId, deletedAt: null }) : null
  }

  async archive(scope: TenantScope, id: string, archivedAt: Date) {
    const result = await this.database.service.updateMany({ where: { id, organizationId: scope.organizationId,
      deletedAt: null }, data: { isActive: false, deletedAt: archivedAt } })
    return result.count ? this.findService({ id, organizationId: scope.organizationId }) : null
  }

  async restore(scope: TenantScope, id: string) {
    const result = await this.database.service.updateMany({ where: { id, organizationId: scope.organizationId,
      deletedAt: { not: null } }, data: { isActive: true, deletedAt: null } })
    return result.count ? this.findService({ id, organizationId: scope.organizationId, deletedAt: null }) : null
  }

  async branchExists(scope: TenantScope, branchId: string) {
    return await this.database.branch.count({ where: { id: branchId, organizationId: scope.organizationId,
      isActive: true, deletedAt: null } }) === 1
  }

  async enableBranchService(scope: TenantScope, data: BranchServiceData) {
    const [branchExists, serviceExists] = await Promise.all([
      this.database.branch.count({ where: { id: data.branchId, organizationId: scope.organizationId,
        isActive: true, deletedAt: null } }),
      this.database.service.count({ where: { id: data.serviceId, organizationId: scope.organizationId,
        isActive: true, deletedAt: null } }),
    ])
    if (!branchExists || !serviceExists) return null
    const existing = await this.database.branchService.findUnique({ where: { branchId_serviceId:
      { branchId: data.branchId, serviceId: data.serviceId } }, select: branchServiceSelect })
    if (existing && (existing.deletedAt === null || existing.branch.organizationId !== scope.organizationId
      || existing.service.organizationId !== scope.organizationId)) return null
    const values = { priceOverride: data.priceOverride, durationOverrideMinutes: data.durationOverrideMinutes,
      isActive: true, deletedAt: null }
    const saved = existing
      ? await this.database.branchService.update({ where: { id: existing.id }, data: values, select: branchServiceSelect })
      : await this.database.branchService.create({ data: { ...data, ...values }, select: branchServiceSelect })
    return mapBranchService(saved)
  }

  async findBranchService(scope: TenantScope, serviceId: string, branchId: string) {
    const value = await this.database.branchService.findFirst({ where: { serviceId, branchId, deletedAt: null,
      branch: { organizationId: scope.organizationId, deletedAt: null },
      service: { organizationId: scope.organizationId, deletedAt: null } }, select: branchServiceSelect })
    return value ? mapBranchService(value) : null
  }

  async findBranchServicePage(scope: TenantScope, serviceId: string, query: CatalogListQuery) {
    const where: Prisma.BranchServiceWhereInput = { serviceId,
      branch: { organizationId: scope.organizationId, deletedAt: null },
      service: { organizationId: scope.organizationId }, ...catalogStatusWhere(query.status),
      ...(scope.branchId ? { branchId: scope.branchId } : {}),
      ...(query.keyword ? { branch: { organizationId: scope.organizationId, deletedAt: null,
        name: { contains: query.keyword, mode: 'insensitive' } } } : {}) }
    const orderBy: Prisma.BranchServiceOrderByWithRelationInput = query.sort === 'name'
      ? { branch: { name: query.order } } : { [query.sort]: query.order }
    const [rows, totalItems] = await Promise.all([
      this.database.branchService.findMany({ where, select: branchServiceSelect, orderBy,
        skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      this.database.branchService.count({ where }),
    ])
    return page(rows.map(mapBranchService), query, totalItems)
  }

  async updateBranchService(scope: TenantScope, serviceId: string, branchId: string, data: UpdateBranchServiceData) {
    const result = await this.database.branchService.updateMany({ where: { serviceId, branchId, deletedAt: null,
      branch: { organizationId: scope.organizationId, deletedAt: null },
      service: { organizationId: scope.organizationId, deletedAt: null } }, data })
    return result.count ? this.findBranchService(scope, serviceId, branchId) : null
  }

  async disableBranchService(scope: TenantScope, serviceId: string, branchId: string, disabledAt: Date) {
    const existing = await this.findBranchService(scope, serviceId, branchId)
    if (!existing) return null
    await this.database.branchService.update({ where: { id: existing.id }, data: { isActive: false, deletedAt: disabledAt } })
    return { ...existing, isActive: false, deletedAt: disabledAt }
  }

  async findSkillById(scope: TenantScope, id: string) {
    return this.skillResult({ id, organizationId: scope.organizationId, deletedAt: null })
  }

  async findSkillByIdAnyStatus(scope: TenantScope, id: string) {
    return this.skillResult({ id, organizationId: scope.organizationId })
  }

  async findSkillPage(scope: TenantScope, query: CatalogListQuery) {
    const where: Prisma.SkillWhereInput = { organizationId: scope.organizationId, ...catalogStatusWhere(query.status),
      ...(query.keyword ? { name: { contains: query.keyword, mode: 'insensitive' } } : {}) }
    const [rows, totalItems] = await Promise.all([
      this.database.skill.findMany({ where, select: skillSelect, orderBy: { [query.sort]: query.order },
        skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      this.database.skill.count({ where }),
    ])
    return page(rows.map(mapSkill), query, totalItems)
  }

  async findActiveSkillByName(scope: TenantScope, name: string, excludeId?: string) {
    const value = await this.database.skill.findFirst({ where: { organizationId: scope.organizationId,
      name: { equals: name, mode: 'insensitive' }, deletedAt: null,
      ...(excludeId ? { id: { not: excludeId } } : {}) }, select: skillSelect })
    return value ? mapSkill(value) : null
  }

  async createSkill(data: CreateSkillData) {
    return mapSkill(await this.database.skill.create({ data, select: skillSelect }))
  }

  async updateSkill(scope: TenantScope, id: string, data: UpdateSkillData) {
    const result = await this.database.skill.updateMany({ where: { id, organizationId: scope.organizationId,
      deletedAt: null }, data })
    return result.count ? this.skill({ id, organizationId: scope.organizationId, deletedAt: null }) : null
  }

  async archiveSkill(scope: TenantScope, id: string, archivedAt: Date) {
    const result = await this.database.skill.updateMany({ where: { id, organizationId: scope.organizationId,
      deletedAt: null }, data: { isActive: false, deletedAt: archivedAt } })
    return result.count ? this.skill({ id, organizationId: scope.organizationId }) : null
  }

  async restoreSkill(scope: TenantScope, id: string) {
    const result = await this.database.skill.updateMany({ where: { id, organizationId: scope.organizationId,
      deletedAt: { not: null } }, data: { isActive: true, deletedAt: null } })
    return result.count ? this.skill({ id, organizationId: scope.organizationId, deletedAt: null }) : null
  }

  async assignServiceSkill(scope: TenantScope, serviceId: string, skillId: string, id: string, requiredLevel: number | null) {
    const [serviceExists, skillExists] = await Promise.all([
      this.database.service.count({ where: { id: serviceId, organizationId: scope.organizationId,
        isActive: true, deletedAt: null } }),
      this.database.skill.count({ where: { id: skillId, organizationId: scope.organizationId,
        isActive: true, deletedAt: null } }),
    ])
    if (!serviceExists || !skillExists) return null
    if (await this.database.serviceSkill.findUnique({ where: { serviceId_skillId: { serviceId, skillId } } })) return null
    const value = await this.database.serviceSkill.create({ data: { id, serviceId, skillId, requiredLevel },
      select: serviceSkillSelect })
    return value.service.organizationId === scope.organizationId && value.skill.organizationId === scope.organizationId
      ? mapServiceSkill(value) : null
  }

  async removeServiceSkill(scope: TenantScope, serviceId: string, skillId: string) {
    const result = await this.database.serviceSkill.deleteMany({ where: { serviceId, skillId,
      service: { organizationId: scope.organizationId, deletedAt: null },
      skill: { organizationId: scope.organizationId } } })
    return result.count === 1
  }

  async findServiceSkills(scope: TenantScope, serviceId: string) {
    const values = await this.database.serviceSkill.findMany({ where: { serviceId,
      service: { organizationId: scope.organizationId }, skill: { organizationId: scope.organizationId } },
    select: serviceSkillSelect, orderBy: { skill: { name: 'asc' } } })
    return values.map(mapServiceSkill)
  }

  private async findService(where: Prisma.ServiceWhereInput) {
    const value = await this.database.service.findFirst({ where, select: serviceSelect })
    return value ? mapService(value) : null
  }

  private async category(where: Prisma.ServiceCategoryWhereInput) {
    const value = await this.database.serviceCategory.findFirst({ where, select: serviceCategorySelect })
    return value ? mapServiceCategory(value) : null
  }

  private async categoryResult(where: Prisma.ServiceCategoryWhereInput) {
    const value = await this.category(where)
    return value ? success(value) : failure(new NotFoundError('Service category was not found'))
  }

  private async skill(where: Prisma.SkillWhereInput) {
    const value = await this.database.skill.findFirst({ where, select: skillSelect })
    return value ? mapSkill(value) : null
  }

  private async skillResult(where: Prisma.SkillWhereInput) {
    const value = await this.skill(where)
    return value ? success(value) : failure(new NotFoundError('Skill was not found'))
  }
}

function catalogStatusWhere(status: CatalogListQuery['status']) {
  if (status === 'ARCHIVED') return { deletedAt: { not: null } }
  if (status === 'ALL') return {}
  return { deletedAt: null, isActive: status === 'ACTIVE' }
}

function catalogStatus(value: { isActive: boolean; deletedAt: Date | null }) {
  return value.deletedAt ? 'ARCHIVED' as const : value.isActive ? 'ACTIVE' as const : 'INACTIVE' as const
}

function page<T>(items: readonly T[], query: { page: number; pageSize: number }, totalItems: number) {
  return { items, page: query.page, pageSize: query.pageSize, totalItems,
    totalPages: Math.ceil(totalItems / query.pageSize) }
}

const serviceCategorySelect = { id: true, organizationId: true, name: true, description: true, displayOrder: true,
  isActive: true, deletedAt: true, createdAt: true, updatedAt: true } satisfies Prisma.ServiceCategorySelect
type SelectedServiceCategory = Prisma.ServiceCategoryGetPayload<{ select: typeof serviceCategorySelect }>
function mapServiceCategory(value: SelectedServiceCategory): ServiceCategoryRecord {
  return { ...value, status: catalogStatus(value) }
}

const skillSelect = { id: true, organizationId: true, name: true, description: true, isActive: true,
  deletedAt: true, createdAt: true, updatedAt: true } satisfies Prisma.SkillSelect
type SelectedSkill = Prisma.SkillGetPayload<{ select: typeof skillSelect }>
function mapSkill(value: SelectedSkill): SkillRecord { return { ...value, status: catalogStatus(value) } }

const branchServiceSelect = { id: true, branchId: true, serviceId: true, priceOverride: true,
  durationOverrideMinutes: true, isActive: true, deletedAt: true, createdAt: true, updatedAt: true,
  branch: { select: { name: true, organizationId: true } },
  service: { select: { organizationId: true, price: true, durationMinutes: true } } } satisfies Prisma.BranchServiceSelect
type SelectedBranchService = Prisma.BranchServiceGetPayload<{ select: typeof branchServiceSelect }>
function mapBranchService(value: SelectedBranchService): BranchServiceRecord {
  return { id: value.id, branchId: value.branchId, branchName: value.branch.name, serviceId: value.serviceId,
    priceOverride: value.priceOverride?.toString() ?? null,
    durationOverrideMinutes: value.durationOverrideMinutes,
    effectivePrice: (value.priceOverride ?? value.service.price).toString(),
    effectiveDurationMinutes: value.durationOverrideMinutes ?? value.service.durationMinutes,
    isActive: value.isActive, deletedAt: value.deletedAt, createdAt: value.createdAt, updatedAt: value.updatedAt }
}

const serviceSkillSelect = { id: true, serviceId: true, skillId: true, requiredLevel: true,
  createdAt: true, updatedAt: true, skill: { select: { name: true, organizationId: true } },
  service: { select: { organizationId: true } } } satisfies Prisma.ServiceSkillSelect
type SelectedServiceSkill = Prisma.ServiceSkillGetPayload<{ select: typeof serviceSkillSelect }>
function mapServiceSkill(value: SelectedServiceSkill): ServiceSkillRecord {
  return { id: value.id, serviceId: value.serviceId, skillId: value.skillId, skillName: value.skill.name,
    requiredLevel: value.requiredLevel, createdAt: value.createdAt, updatedAt: value.updatedAt }
}

const serviceSelect = { id: true, organizationId: true, categoryId: true, code: true, name: true,
  description: true, durationMinutes: true, bufferBeforeMinutes: true, bufferAfterMinutes: true,
  price: true, taxType: true, taxMode: true, taxRate: true, isActive: true, deletedAt: true,
  createdAt: true, updatedAt: true, category: { select: { name: true } },
  branchServices: { where: { deletedAt: null }, select: branchServiceSelect },
  requiredSkills: { select: serviceSkillSelect } } satisfies Prisma.ServiceSelect
type SelectedService = Prisma.ServiceGetPayload<{ select: typeof serviceSelect }>
function mapService(value: SelectedService): ServiceRecord {
  return { id: value.id, organizationId: value.organizationId, categoryId: value.categoryId,
    categoryName: value.category.name, code: value.code, name: value.name, description: value.description,
    durationMinutes: value.durationMinutes, bufferBeforeMinutes: value.bufferBeforeMinutes,
    bufferAfterMinutes: value.bufferAfterMinutes, price: value.price.toString(), taxType: value.taxType,
    taxMode: value.taxMode, taxRate: value.taxRate.toString(), isActive: value.isActive,
    status: catalogStatus(value), deletedAt: value.deletedAt,
    branchServices: value.branchServices.map(mapBranchService), requiredSkills: value.requiredSkills.map(mapServiceSkill),
    createdAt: value.createdAt, updatedAt: value.updatedAt }
}

const paymentRefundSelect = { id: true, paymentId: true, refundedByUserId: true, amount: true, currency: true,
  reason: true, externalReference: true, notes: true, createdAt: true, updatedAt: true,
  refundedBy: { select: { displayName: true } } } satisfies Prisma.PaymentRefundSelect
const paymentSelect = { id: true, bookingId: true, receivedByUserId: true, amount: true, currency: true,
  method: true, status: true, externalReference: true, idempotencyKey: true, paidAt: true, refundedAt: true,
  voidedAt: true, voidReason: true, notes: true, createdAt: true, updatedAt: true,
  receivedBy: { select: { displayName: true } }, refunds: { select: paymentRefundSelect, orderBy: { createdAt: 'asc' } },
  booking: { select: { bookingNumber: true, customerId: true, branchId: true,
    customer: { select: { firstName: true, lastName: true, phone: true } } } } } satisfies Prisma.PaymentSelect
type SelectedPayment = Prisma.PaymentGetPayload<{ select: typeof paymentSelect }>

function mapPaymentRefund(value: SelectedPayment['refunds'][number]): PaymentRefundRecord {
  return { id: value.id, paymentId: value.paymentId, refundedByUserId: value.refundedByUserId,
    cashierName: value.refundedBy?.displayName ?? null, amount: value.amount.toFixed(2), currency: value.currency,
    reason: value.reason, externalReference: value.externalReference, notes: value.notes,
    createdAt: value.createdAt, updatedAt: value.updatedAt }
}

function mapPayment(value: SelectedPayment): PaymentRecord {
  const refunds = value.refunds.map(mapPaymentRefund)
  const refunded = refunds.reduce((total, refund) => total.plus(refund.amount), new Prisma.Decimal(0))
  return { id: value.id, bookingId: value.bookingId, branchId: value.booking.branchId,
    bookingNumber: value.booking.bookingNumber, customerId: value.booking.customerId,
    customerName: [value.booking.customer.firstName, value.booking.customer.lastName].filter(Boolean).join(' '),
    customerPhone: value.booking.customer.phone, receivedByUserId: value.receivedByUserId,
    cashierName: value.receivedBy?.displayName ?? null, amount: value.amount.toFixed(2), currency: value.currency,
    method: value.method, status: value.status, externalReference: value.externalReference,
    idempotencyKey: value.idempotencyKey, paidAt: value.paidAt, refundedAt: value.refundedAt,
    voidedAt: value.voidedAt, voidReason: value.voidReason, notes: value.notes, refunds,
    refundedAmount: refunded.toFixed(2), netAmount: value.status === 'VOID' ? '0.00' : value.amount.minus(refunded).toFixed(2),
    createdAt: value.createdAt, updatedAt: value.updatedAt }
}

export class PrismaPaymentRepository extends PrismaReadRepository<PaymentRecord> implements PaymentRepository {
  protected async findScoped(scope: TenantScope, id: string): Promise<PaymentRecord | null> {
    return this.findPayment(scope, { id })
  }

  async findPage(scope: TenantScope, query: PaymentListQuery) {
    const where: Prisma.PaymentWhereInput = { booking: { deletedAt: null, branchId: query.branchId,
      branch: { organizationId: scope.organizationId, deletedAt: null },
      ...(query.bookingId ? { id: query.bookingId } : {}), ...(query.customerId ? { customerId: query.customerId } : {}) },
      ...(query.method ? { method: query.method } : {}), ...(query.status ? { status: query.status } : {}),
      ...(query.dateFrom || query.dateTo ? { createdAt: { ...(query.dateFrom ? { gte: query.dateFrom } : {}),
        ...(query.dateTo ? { lt: query.dateTo } : {}) } } : {}),
      ...(query.keyword ? { OR: [{ externalReference: { contains: query.keyword, mode: 'insensitive' } },
        { booking: { bookingNumber: { contains: query.keyword, mode: 'insensitive' } } },
        { booking: { customer: { firstName: { contains: query.keyword, mode: 'insensitive' } } } },
        { booking: { customer: { lastName: { contains: query.keyword, mode: 'insensitive' } } } },
        { booking: { customer: { phone: { contains: query.keyword } } } }] } : {}) }
    const [rows, totalItems] = await Promise.all([this.database.payment.findMany({ where, select: paymentSelect,
      orderBy: { [query.sort]: query.order }, skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
    this.database.payment.count({ where })])
    return page(rows.map(mapPayment), query, totalItems)
  }

  async findBookingFinancials(scope: TenantScope, bookingId: string): Promise<CheckoutFinancialRecord | null> {
    const value = await this.database.booking.findFirst({ where: { id: bookingId,
      ...(scope.branchId ? { branchId: scope.branchId } : {}),
      deletedAt: null, branch: { organizationId: scope.organizationId, deletedAt: null } }, select: {
      id: true, bookingNumber: true, status: true, paymentStatus: true, saleClosedAt: true, closedByUserId: true,
      closedBy: { select: { displayName: true } }, branchId: true,
      branch: { select: { name: true, organizationId: true, organization: { select: { name: true, currency: true } } } },
      customerId: true, customer: { select: { firstName: true, lastName: true, phone: true } },
      items: { select: bookingItemSelect, orderBy: [{ startsAt: 'asc' }, { id: 'asc' }] },
      discounts: { select: { id: true, promotionId: true, promotionCode: true, description: true,
        discountType: true, discountValue: true, discountAmount: true } },
      payments: { select: paymentSelect, orderBy: { createdAt: 'asc' } } } })
    if (!value) return null
    return { organizationId: value.branch.organizationId, organizationName: value.branch.organization.name,
      currency: value.branch.organization.currency, branchId: value.branchId, branchName: value.branch.name,
      customerId: value.customerId, customerName: [value.customer.firstName, value.customer.lastName].filter(Boolean).join(' '),
      customerPhone: value.customer.phone, bookingId: value.id, bookingNumber: value.bookingNumber,
      bookingStatus: value.status, paymentStatus: value.paymentStatus, saleClosedAt: value.saleClosedAt,
      closedByUserId: value.closedByUserId, closedByName: value.closedBy?.displayName ?? null,
      items: value.items.map(mapBookingItem), discounts: value.discounts.map((discount) => ({ ...discount,
        discountValue: discount.discountValue.toFixed(2), discountAmount: discount.discountAmount.toFixed(2) })),
      payments: value.payments.map(mapPayment) }
  }

  async findByIdempotencyKey(scope: TenantScope, idempotencyKey: string) {
    return this.findPayment(scope, { idempotencyKey })
  }

  async acquireFinancialLocks(scope: TenantScope, keys: readonly string[]) {
    for (const key of [...new Set(keys)].sort()) await this.database.$queryRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${scope.organizationId}:financial:${key}`}, 0)) IS NULL AS "acquired"`)
  }

  async create(data: CreatePaymentData) {
    return mapPayment(await this.database.payment.create({ data, select: paymentSelect }))
  }

  async createMany(data: readonly CreatePaymentData[]) {
    const values: PaymentRecord[] = []
    for (const payment of data) values.push(await this.create(payment))
    return values
  }

  async void(scope: TenantScope, paymentId: string, voidedAt: Date, reason: string) {
    const result = await this.database.payment.updateMany({ where: { id: paymentId, status: 'PAID',
      booking: { ...(scope.branchId ? { branchId: scope.branchId } : {}), saleClosedAt: null,
        branch: { organizationId: scope.organizationId } } },
    data: { status: 'VOID', voidedAt, voidReason: reason } })
    return result.count ? this.findPayment(scope, { id: paymentId }) : null
  }

  async createRefund(scope: TenantScope, data: CreatePaymentRefundData) {
    if (!await this.findPayment(scope, { id: data.paymentId })) return null
    const value = await this.database.paymentRefund.create({ data, select: paymentRefundSelect })
    return mapPaymentRefund(value)
  }

  async updateRefundStatus(scope: TenantScope, paymentId: string, status: 'PARTIAL' | 'REFUNDED', refundedAt: Date) {
    const result = await this.database.payment.updateMany({ where: { id: paymentId, status: { in: ['PAID', 'PARTIAL'] },
      booking: { ...(scope.branchId ? { branchId: scope.branchId } : {}),
        branch: { organizationId: scope.organizationId } } },
    data: { status, refundedAt } })
    return result.count ? this.findPayment(scope, { id: paymentId }) : null
  }

  async updateBookingPaymentStatus(scope: TenantScope, bookingId: string, status: PaymentRecord['status']) {
    const result = await this.database.booking.updateMany({ where: { id: bookingId,
      ...(scope.branchId ? { branchId: scope.branchId } : {}),
      branch: { organizationId: scope.organizationId } }, data: { paymentStatus: status } })
    return result.count === 1
  }

  async closeSale(scope: TenantScope, bookingId: string, closedAt: Date, closedByUserId: string) {
    const result = await this.database.booking.updateMany({ where: { id: bookingId,
      ...(scope.branchId ? { branchId: scope.branchId } : {}),
      status: 'COMPLETED', paymentStatus: 'PAID', saleClosedAt: null,
      branch: { organizationId: scope.organizationId } }, data: { saleClosedAt: closedAt, closedByUserId } })
    return result.count === 1
  }

  private async findPayment(scope: TenantScope, where: Prisma.PaymentWhereInput) {
    const value = await this.database.payment.findFirst({ where: { ...where, booking: {
      ...(scope.branchId ? { branchId: scope.branchId } : {}),
      deletedAt: null, branch: { organizationId: scope.organizationId, deletedAt: null } } }, select: paymentSelect })
    return value ? mapPayment(value) : null
  }
}

export function createPrismaRepositories(database: PrismaDatabase): RepositorySet {
  return {
    customers: new PrismaCustomerRepository(database),
    employees: new PrismaEmployeeRepository(database),
    bookings: new PrismaBookingRepository(database),
    services: new PrismaServiceRepository(database),
    payments: new PrismaPaymentRepository(database),
    commissions: new PrismaCommissionRepository(database),
  }
}
