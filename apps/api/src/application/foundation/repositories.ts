import type { NotFoundError } from '../../domain/foundation/domain-errors.js'
import type { Result } from '../../domain/foundation/result.js'
import type { DashboardReportRepository } from './dashboard-report-repository.js'
import type { PageResult, SortDirectionValue } from './query.js'

export type EmployeeStatusValue = 'ACTIVE' | 'INACTIVE' | 'TERMINATED'
export type EmployeeLifecycleStatus = EmployeeStatusValue | 'ARCHIVED'
export type BookingStatusValue = 'PENDING' | 'CONFIRMED' | 'CHECKED_IN' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW'
export type BookingSourceValue = 'WALK_IN' | 'WEBSITE' | 'LINE' | 'FACEBOOK' | 'PHONE'
export type BookingItemStatusValue = 'SCHEDULED' | 'IN_SERVICE' | 'COMPLETED' | 'CANCELLED'
export type PaymentMethodValue = 'CASH' | 'QR' | 'CARD' | 'BANK_TRANSFER' | 'E_WALLET'
export type PaymentStatusValue = 'PENDING' | 'PAID' | 'PARTIAL' | 'REFUNDED' | 'VOID'
export type CommissionTypeValue = 'PERCENT' | 'FIXED' | 'TIER' | 'MIXED'
export type CommissionBasisValue = 'SERVICE_PRICE' | 'PAID_AMOUNT'
export type CommissionAdjustmentTypeValue = 'RECALCULATION' | 'REFUND'
export type CommissionPeriodStatusValue = 'OPEN' | 'APPROVED' | 'LOCKED'
export type TaxTypeValue = 'NONE' | 'VAT'
export type TaxModeValue = 'INCLUDED' | 'EXCLUDED'
export type CustomerStatusValue = 'ACTIVE' | 'ARCHIVED'
export type CatalogStatusValue = 'ACTIVE' | 'INACTIVE' | 'ARCHIVED'

export interface TenantScope {
  organizationId: string
  branchId?: string
}

export interface Repository<TEntity, TId = string> {
  findById(scope: TenantScope, id: TId): Promise<Result<TEntity, NotFoundError>>
}

export interface CustomerRecord {
  id: string
  organizationId: string
  preferredBranchId: string | null
  customerNumber: string
  firstName: string
  lastName: string | null
  phone: string | null
  email: string | null
  dateOfBirth: Date | null
  notes: string | null
  lastVisitAt: Date | null
  deletedAt: Date | null
  status: CustomerStatusValue
  tags: readonly CustomerTagRecord[]
  createdAt: Date
  updatedAt: Date
}

export interface CustomerTagRecord {
  id: string
  name: string
  color: string | null
}

export interface CreateCustomerData {
  id: string
  organizationId: string
  preferredBranchId: string | null
  customerNumber: string
  firstName: string
  lastName: string | null
  phone: string | null
  email: string | null
  dateOfBirth: string | null
  notes: string | null
}

export type UpdateCustomerData = Partial<Omit<CreateCustomerData, 'id' | 'organizationId' | 'customerNumber'>>

export interface CustomerListQuery {
  keyword?: string
  status: CustomerStatusValue | 'ALL'
  tagId?: string
  tagName?: string
  page: number
  pageSize: number
  sort: 'createdAt' | 'updatedAt' | 'firstName' | 'lastVisitAt'
  order: SortDirectionValue
}

export interface EmployeeRecord {
  id: string
  organizationId: string
  userId: string | null
  employeeCode: string
  displayName: string
  firstName: string | null
  lastName: string | null
  phone: string | null
  email: string | null
  hireDate: Date | null
  status: EmployeeLifecycleStatus
  employmentStatus: EmployeeStatusValue
  deletedAt: Date | null
  branches: readonly EmployeeBranchRecord[]
  skills: readonly EmployeeSkillRecord[]
  createdAt: Date
  updatedAt: Date
}

export interface EmployeeBranchRecord {
  id: string
  branchId: string
  branchName: string
  isPrimary: boolean
  isActive: boolean
}

export interface EmployeeSkillRecord {
  id: string
  skillId: string
  skillName: string
  proficiencyLevel: number | null
  certifiedAt: Date | null
  expiresAt: Date | null
  notes: string | null
}

export interface WorkingHourRecord {
  id: string
  employeeBranchId: string
  branchId: string
  dayOfWeek: number
  startTime: string
  endTime: string
  effectiveFrom: Date | null
  effectiveTo: Date | null
  isActive: boolean
}

export interface EmployeeTimeOffRecord {
  id: string
  employeeId: string
  branchId: string | null
  startsAt: Date
  endsAt: Date
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED'
  reason: string | null
}

export interface CreateEmployeeData {
  id: string
  organizationId: string
  employeeCode: string
  displayName: string
  firstName: string | null
  lastName: string | null
  phone: string | null
  email: string | null
  hireDate: string | null
}

export type UpdateEmployeeData = Partial<Omit<CreateEmployeeData, 'id' | 'organizationId' | 'employeeCode'>> & {
  status?: EmployeeStatusValue
}

export interface EmployeeListQuery {
  keyword?: string
  status: EmployeeLifecycleStatus | 'ALL'
  branchId?: string
  skillId?: string
  page: number
  pageSize: number
  sort: 'createdAt' | 'updatedAt' | 'displayName' | 'employeeCode' | 'hireDate'
  order: SortDirectionValue
}

export interface AssignEmployeeSkillData {
  id: string
  skillId: string
  proficiencyLevel: number | null
  certifiedAt: string | null
  expiresAt: string | null
  notes: string | null
}

export interface WorkingHourData {
  id: string
  employeeBranchId: string
  dayOfWeek: number
  startTime: string
  endTime: string
  effectiveFrom: string | null
  effectiveTo: string | null
}

export type UpdateWorkingHourData = Partial<Omit<WorkingHourData, 'id' | 'employeeBranchId'>>

export interface EmployeeTimeOffData {
  id: string
  employeeId: string
  branchId: string | null
  startsAt: string
  endsAt: string
  reason: string | null
}

export interface BookingRecord {
  id: string
  branchId: string
  branchName: string
  customerId: string
  customerName: string
  customerPhone: string | null
  createdByUserId: string | null
  bookingNumber: string
  status: BookingStatusValue
  source: BookingSourceValue
  startsAt: Date
  endsAt: Date
  customerNotes: string | null
  internalNotes: string | null
  cancellationReason: string | null
  cancelledAt: Date | null
  completedAt: Date | null
  paymentStatus: PaymentStatusValue
  saleClosedAt: Date | null
  closedByUserId: string | null
  deletedAt: Date | null
  items: readonly BookingItemRecord[]
  subtotalAmount: string
  taxAmount: string
  totalAmount: string
  createdAt: Date
  updatedAt: Date
}

export interface BookingItemRecord {
  id: string
  bookingId: string
  serviceId: string
  employeeId: string
  employeeName: string
  serviceName: string
  status: BookingItemStatusValue
  startsAt: Date
  endsAt: Date
  durationMinutes: number
  quantity: number
  unitPrice: string
  discountAmount: string
  subtotalAmount: string
  taxType: TaxTypeValue
  taxMode: TaxModeValue
  taxRate: string
  taxAmount: string
  totalAmount: string
  notes: string | null
  createdAt: Date
  updatedAt: Date
}

export interface BookingListQuery {
  keyword?: string
  customerId?: string
  employeeId?: string
  branchId: string
  status?: BookingStatusValue
  dateFrom?: Date
  dateTo?: Date
  serviceId?: string
  page: number
  pageSize: number
  sort: 'createdAt' | 'updatedAt' | 'startsAt' | 'bookingNumber' | 'status'
  order: SortDirectionValue
}

export interface BookingCalendarQuery {
  branchId: string
  startsAt: Date
  endsAt: Date
  employeeId?: string
}

export interface BookableServiceRecord {
  id: string
  name: string
  durationMinutes: number
  effectivePrice: string
  taxType: TaxTypeValue
  taxMode: TaxModeValue
  taxRate: string
  requiredSkills: readonly { skillId: string; requiredLevel: number | null }[]
}

export interface BookingEmployeeRecord {
  id: string
  displayName: string
  skills: readonly { skillId: string; proficiencyLevel: number | null }[]
  workingHours: readonly { dayOfWeek: number; startTime: string; endTime: string;
    effectiveFrom: string | null; effectiveTo: string | null }[]
  timeOffs: readonly { startsAt: Date; endsAt: Date }[]
  blocks: readonly { bookingId: string; startsAt: Date; endsAt: Date }[]
}

export interface BookingAvailabilityData {
  branchId: string
  branchName: string
  timezone: string
  slotIntervalMinutes: number | null
  services: readonly BookableServiceRecord[]
  employees: readonly BookingEmployeeRecord[]
  holidays: readonly { startsAt: Date; endsAt: Date }[]
}

export interface BookingItemSnapshotData {
  id: string
  serviceId: string
  employeeId: string
  serviceName: string
  startsAt: Date
  endsAt: Date
  durationMinutes: number
  quantity: number
  unitPrice: string
  discountAmount: string
  subtotalAmount: string
  taxType: TaxTypeValue
  taxMode: TaxModeValue
  taxRate: string
  taxAmount: string
  totalAmount: string
  notes: string | null
}

export interface CreateBookingData {
  id: string
  branchId: string
  customerId: string
  createdByUserId: string
  bookingNumber: string
  source: BookingSourceValue
  startsAt: Date
  endsAt: Date
  customerNotes: string | null
  internalNotes: string | null
  items: readonly BookingItemSnapshotData[]
}

export interface UpdateBookingMetadataData {
  customerNotes?: string | null
  internalNotes?: string | null
  source?: BookingSourceValue
}

export interface BookingItemScheduleData { id: string; employeeId: string; startsAt: Date; endsAt: Date }

export interface ServiceRecord {
  id: string
  organizationId: string
  categoryId: string
  categoryName: string
  code: string
  name: string
  description: string | null
  durationMinutes: number
  bufferBeforeMinutes: number
  bufferAfterMinutes: number
  price: string
  taxType: TaxTypeValue
  taxMode: TaxModeValue
  taxRate: string
  isActive: boolean
  status: CatalogStatusValue
  deletedAt: Date | null
  branchServices: readonly BranchServiceRecord[]
  requiredSkills: readonly ServiceSkillRecord[]
  createdAt: Date
  updatedAt: Date
}

export interface ServiceCategoryRecord {
  id: string
  organizationId: string
  name: string
  description: string | null
  displayOrder: number
  isActive: boolean
  status: CatalogStatusValue
  deletedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export interface SkillRecord {
  id: string
  organizationId: string
  name: string
  description: string | null
  isActive: boolean
  status: CatalogStatusValue
  deletedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export interface BranchServiceRecord {
  id: string
  branchId: string
  branchName: string
  serviceId: string
  priceOverride: string | null
  durationOverrideMinutes: number | null
  effectivePrice: string
  effectiveDurationMinutes: number
  isActive: boolean
  deletedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export interface ServiceSkillRecord {
  id: string
  serviceId: string
  skillId: string
  skillName: string
  requiredLevel: number | null
  createdAt: Date
  updatedAt: Date
}

export interface CatalogListQuery {
  keyword?: string
  status: CatalogStatusValue | 'ALL'
  page: number
  pageSize: number
  sort: 'createdAt' | 'updatedAt' | 'name'
  order: SortDirectionValue
}

export interface ServiceListQuery extends Omit<CatalogListQuery, 'sort'> {
  categoryId?: string
  branchId?: string
  skillId?: string
  sort: 'createdAt' | 'updatedAt' | 'name' | 'price' | 'durationMinutes'
}

export interface CreateServiceCategoryData {
  id: string
  organizationId: string
  name: string
  description: string | null
  displayOrder: number
  isActive: boolean
}

export type UpdateServiceCategoryData = Partial<Omit<CreateServiceCategoryData, 'id' | 'organizationId'>>

export interface CreateServiceData {
  id: string
  organizationId: string
  categoryId: string
  code: string
  name: string
  description: string | null
  durationMinutes: number
  bufferBeforeMinutes: number
  bufferAfterMinutes: number
  price: string
  taxType: TaxTypeValue
  taxMode: TaxModeValue
  taxRate: string
  isActive: boolean
}

export type UpdateServiceData = Partial<Omit<CreateServiceData, 'id' | 'organizationId'>>

export interface BranchServiceData {
  id: string
  branchId: string
  serviceId: string
  priceOverride: string | null
  durationOverrideMinutes: number | null
}

export type UpdateBranchServiceData = Partial<Pick<BranchServiceData, 'priceOverride' | 'durationOverrideMinutes'>> & {
  isActive?: boolean
}

export interface CreateSkillData {
  id: string
  organizationId: string
  name: string
  description: string | null
  isActive: boolean
}

export type UpdateSkillData = Partial<Omit<CreateSkillData, 'id' | 'organizationId'>>

export interface PaymentRecord {
  id: string
  bookingId: string
  branchId: string
  bookingNumber: string
  customerId: string
  customerName: string
  customerPhone: string | null
  receivedByUserId: string | null
  cashierName: string | null
  amount: string
  currency: string
  method: PaymentMethodValue
  status: PaymentStatusValue
  externalReference: string | null
  idempotencyKey: string | null
  paidAt: Date | null
  refundedAt: Date | null
  voidedAt: Date | null
  voidReason: string | null
  notes: string | null
  refunds: readonly PaymentRefundRecord[]
  refundedAmount: string
  netAmount: string
  createdAt: Date
  updatedAt: Date
}

export interface PaymentRefundRecord {
  id: string
  paymentId: string
  refundedByUserId: string | null
  cashierName: string | null
  amount: string
  currency: string
  reason: string
  externalReference: string | null
  notes: string | null
  createdAt: Date
  updatedAt: Date
}

export interface CheckoutDiscountRecord {
  id: string
  promotionId: string | null
  promotionCode: string | null
  description: string
  discountType: 'PERCENT' | 'FIXED'
  discountValue: string
  discountAmount: string
}

export interface CheckoutFinancialRecord {
  organizationId: string
  organizationName: string
  currency: string
  branchId: string
  branchName: string
  customerId: string
  customerName: string
  customerPhone: string | null
  bookingId: string
  bookingNumber: string
  bookingStatus: BookingStatusValue
  paymentStatus: PaymentStatusValue
  saleClosedAt: Date | null
  closedByUserId: string | null
  closedByName: string | null
  items: readonly BookingItemRecord[]
  discounts: readonly CheckoutDiscountRecord[]
  payments: readonly PaymentRecord[]
}

export interface PaymentListQuery {
  keyword?: string
  bookingId?: string
  customerId?: string
  branchId: string
  method?: PaymentMethodValue
  status?: PaymentStatusValue
  dateFrom?: Date
  dateTo?: Date
  page: number
  pageSize: number
  sort: 'createdAt' | 'updatedAt' | 'paidAt' | 'amount' | 'status'
  order: SortDirectionValue
}

export interface CreatePaymentData {
  id: string
  bookingId: string
  receivedByUserId: string
  amount: string
  currency: string
  method: PaymentMethodValue
  status: 'PAID'
  externalReference: string | null
  idempotencyKey: string | null
  paidAt: Date
  notes: string | null
}

export interface CreatePaymentRefundData {
  id: string
  paymentId: string
  refundedByUserId: string
  amount: string
  currency: string
  reason: string
  externalReference: string | null
  notes: string | null
}

export interface CommissionTierRecord {
  id: string
  minimumAmount: string
  maximumAmount: string | null
  percentageRate: string | null
  fixedAmount: string | null
}

export interface CommissionRuleRecord {
  id: string
  organizationId: string
  branchId: string | null
  employeeId: string | null
  serviceId: string | null
  name: string
  type: CommissionTypeValue
  basis: CommissionBasisValue
  percentageRate: string | null
  fixedAmount: string | null
  priority: number
  effectiveFrom: Date
  effectiveTo: Date | null
  tiers: readonly CommissionTierRecord[]
}

export interface CommissionAdjustmentRecord {
  id: string
  commissionHistoryId: string
  commissionPeriodId: string
  bookingItemId: string
  employeeId: string
  commissionRuleId: string
  paymentRefundId: string | null
  createdByUserId: string
  type: CommissionAdjustmentTypeValue
  ruleName: string
  commissionType: CommissionTypeValue
  basis: CommissionBasisValue
  baseAmount: string
  percentageRate: string | null
  fixedAmount: string | null
  previousAmount: string
  adjustmentAmount: string
  resultingAmount: string
  reason: string
  calculatedAt: Date
  createdAt: Date
}

export interface CommissionApprovalRecord {
  id: string
  commissionHistoryId: string
  commissionPeriodId: string
  approvedByUserId: string
  approvedAmount: string
  reason: string
  approvedAt: Date
  createdAt: Date
}

export interface CommissionHistoryRecord {
  id: string
  organizationId: string
  branchId: string
  bookingId: string
  bookingNumber: string
  bookingItemId: string
  serviceId: string
  serviceName: string
  employeeId: string
  employeeName: string
  commissionRuleId: string
  paymentId: string | null
  ruleName: string
  type: CommissionTypeValue
  basis: CommissionBasisValue
  baseAmount: string
  percentageRate: string | null
  fixedAmount: string | null
  commissionAmount: string
  effectiveAmount: string
  calculatedAt: Date
  saleClosedAt: Date | null
  adjustments: readonly CommissionAdjustmentRecord[]
  approvals: readonly CommissionApprovalRecord[]
}

export interface CommissionPeriodRecord {
  id: string
  organizationId: string
  branchId: string
  startsAt: Date
  endsAt: Date
  status: CommissionPeriodStatusValue
  approvedByUserId: string | null
  approvedAt: Date | null
  approvalReason: string | null
  lockedByUserId: string | null
  lockedAt: Date | null
  lockReason: string | null
  createdAt: Date
  updatedAt: Date
}

export interface CommissionListQuery {
  keyword?: string
  bookingId?: string
  bookingItemId?: string
  employeeId?: string
  serviceId?: string
  branchId: string
  status?: 'PENDING' | 'APPROVED'
  dateFrom?: Date
  dateTo?: Date
  page: number
  pageSize: number
  sort: 'calculatedAt' | 'commissionAmount' | 'employeeName' | 'serviceName'
  order: SortDirectionValue
}

export interface CreateCommissionHistoryData {
  id: string
  bookingItemId: string
  employeeId: string
  commissionRuleId: string
  paymentId: string | null
  ruleName: string
  type: CommissionTypeValue
  basis: CommissionBasisValue
  baseAmount: string
  percentageRate: string | null
  fixedAmount: string | null
  commissionAmount: string
  calculatedAt: Date
}

export interface CreateCommissionAdjustmentData {
  id: string
  organizationId: string
  branchId: string
  commissionHistoryId: string
  commissionPeriodId: string
  bookingItemId: string
  employeeId: string
  commissionRuleId: string
  paymentRefundId: string | null
  createdByUserId: string
  type: CommissionAdjustmentTypeValue
  ruleName: string
  commissionType: CommissionTypeValue
  basis: CommissionBasisValue
  baseAmount: string
  percentageRate: string | null
  fixedAmount: string | null
  previousAmount: string
  adjustmentAmount: string
  resultingAmount: string
  reason: string
  calculatedAt: Date
}

export interface CommissionSummaryRecord {
  employeeId: string
  employeeName: string
  baseCommissionAmount: string
  adjustmentAmount: string
  effectiveCommissionAmount: string
  approvedCommissionAmount: string
  itemCount: number
}

export interface CustomerRepository extends Repository<CustomerRecord> {
  findByIdAnyStatus(scope: TenantScope, id: string): Promise<Result<CustomerRecord, NotFoundError>>
  findPage(scope: TenantScope, query: CustomerListQuery): Promise<PageResult<CustomerRecord>>
  acquirePhoneLock(scope: TenantScope, phone: string): Promise<void>
  findActiveByPhone(scope: TenantScope, phone: string, excludeCustomerId?: string): Promise<CustomerRecord | null>
  create(data: CreateCustomerData): Promise<CustomerRecord>
  update(scope: TenantScope, id: string, data: UpdateCustomerData): Promise<CustomerRecord | null>
  archive(scope: TenantScope, id: string, archivedAt: Date): Promise<CustomerRecord | null>
  restore(scope: TenantScope, id: string): Promise<CustomerRecord | null>
  findActiveTag(scope: TenantScope, tagId: string): Promise<CustomerTagRecord | null>
  assignTag(scope: TenantScope, customerId: string, tagId: string): Promise<boolean>
  removeTag(scope: TenantScope, customerId: string, tagId: string, removedAt: Date): Promise<boolean>
}
export interface EmployeeRepository extends Repository<EmployeeRecord> {
  findByIdAnyStatus(scope: TenantScope, id: string): Promise<Result<EmployeeRecord, NotFoundError>>
  findPage(scope: TenantScope, query: EmployeeListQuery): Promise<PageResult<EmployeeRecord>>
  createWithPrimaryBranch(data: CreateEmployeeData, branchId: string, assignmentId: string): Promise<EmployeeRecord>
  update(scope: TenantScope, id: string, data: UpdateEmployeeData): Promise<EmployeeRecord | null>
  archive(scope: TenantScope, id: string, archivedAt: Date): Promise<EmployeeRecord | null>
  restore(scope: TenantScope, id: string): Promise<EmployeeRecord | null>
  branchExists(scope: TenantScope, branchId: string): Promise<boolean>
  assignBranch(scope: TenantScope, employeeId: string, branchId: string, assignmentId: string): Promise<boolean>
  removeBranch(scope: TenantScope, employeeId: string, branchId: string, removedAt: Date): Promise<boolean>
  setPrimaryBranch(scope: TenantScope, employeeId: string, branchId: string): Promise<boolean>
  findActiveSkill(scope: TenantScope, skillId: string): Promise<boolean>
  assignSkill(scope: TenantScope, employeeId: string, data: AssignEmployeeSkillData): Promise<boolean>
  removeSkill(scope: TenantScope, employeeId: string, skillId: string, removedAt: Date): Promise<boolean>
  findEmployeeBranch(scope: TenantScope, employeeId: string, branchId: string): Promise<EmployeeBranchRecord | null>
  findWorkingHour(scope: TenantScope, employeeId: string, workingHourId: string): Promise<WorkingHourRecord | null>
  hasWorkingHourOverlap(scope: TenantScope, employeeId: string, data: Omit<WorkingHourData, 'id'>, excludeId?: string): Promise<boolean>
  createWorkingHour(scope: TenantScope, employeeId: string, data: WorkingHourData): Promise<WorkingHourRecord | null>
  updateWorkingHour(scope: TenantScope, employeeId: string, id: string, data: UpdateWorkingHourData): Promise<WorkingHourRecord | null>
  removeWorkingHour(scope: TenantScope, employeeId: string, id: string, removedAt: Date): Promise<boolean>
  createTimeOff(scope: TenantScope, data: EmployeeTimeOffData): Promise<EmployeeTimeOffRecord>
  cancelTimeOff(scope: TenantScope, employeeId: string, id: string): Promise<EmployeeTimeOffRecord | null>
}
export interface BookingRepository extends Repository<BookingRecord> {
  findByIdAnyStatus(scope: TenantScope, id: string): Promise<Result<BookingRecord, NotFoundError>>
  findPage(scope: TenantScope, query: BookingListQuery): Promise<PageResult<BookingRecord>>
  findCalendar(scope: TenantScope, query: BookingCalendarQuery): Promise<readonly BookingRecord[]>
  loadAvailabilityData(scope: TenantScope, branchId: string, serviceIds: readonly string[],
    rangeStart: Date, rangeEnd: Date, excludeBookingId?: string): Promise<BookingAvailabilityData | null>
  findActiveCustomer(scope: TenantScope, customerId: string): Promise<boolean>
  acquireBookingLocks(scope: TenantScope, keys: readonly string[]): Promise<void>
  hasCustomerConflict(scope: TenantScope, customerId: string, startsAt: Date, endsAt: Date,
    excludeBookingId?: string): Promise<boolean>
  createWithItems(data: CreateBookingData): Promise<BookingRecord>
  updateMetadata(scope: TenantScope, id: string, data: UpdateBookingMetadataData): Promise<BookingRecord | null>
  updateSchedule(scope: TenantScope, id: string, startsAt: Date, endsAt: Date,
    items: readonly BookingItemScheduleData[]): Promise<BookingRecord | null>
  transitionStatus(scope: TenantScope, id: string, from: BookingStatusValue, to: BookingStatusValue,
    changedAt: Date, reason?: string): Promise<BookingRecord | null>
  addItem(scope: TenantScope, bookingId: string, bookingEndsAt: Date, item: BookingItemSnapshotData): Promise<BookingRecord | null>
  updateItem(scope: TenantScope, bookingId: string, itemId: string, item: BookingItemSnapshotData,
    bookingEndsAt: Date, following: readonly BookingItemScheduleData[]): Promise<BookingRecord | null>
  cancelItem(scope: TenantScope, bookingId: string, itemId: string, bookingStartsAt: Date, bookingEndsAt: Date,
    following: readonly BookingItemScheduleData[]): Promise<BookingRecord | null>
}
export interface ServiceRepository extends Repository<ServiceRecord> {
  acquireCatalogLock(scope: TenantScope, key: string): Promise<void>
  findCategoryById(scope: TenantScope, id: string): Promise<Result<ServiceCategoryRecord, NotFoundError>>
  findCategoryByIdAnyStatus(scope: TenantScope, id: string): Promise<Result<ServiceCategoryRecord, NotFoundError>>
  findCategoryPage(scope: TenantScope, query: CatalogListQuery): Promise<PageResult<ServiceCategoryRecord>>
  findActiveCategoryByName(scope: TenantScope, name: string, excludeId?: string): Promise<ServiceCategoryRecord | null>
  createCategory(data: CreateServiceCategoryData): Promise<ServiceCategoryRecord>
  updateCategory(scope: TenantScope, id: string, data: UpdateServiceCategoryData): Promise<ServiceCategoryRecord | null>
  archiveCategory(scope: TenantScope, id: string, archivedAt: Date): Promise<ServiceCategoryRecord | null>
  restoreCategory(scope: TenantScope, id: string): Promise<ServiceCategoryRecord | null>
  findByIdAnyStatus(scope: TenantScope, id: string): Promise<Result<ServiceRecord, NotFoundError>>
  findPage(scope: TenantScope, query: ServiceListQuery): Promise<PageResult<ServiceRecord>>
  findActiveByName(scope: TenantScope, name: string, excludeId?: string): Promise<ServiceRecord | null>
  findActiveByCode(scope: TenantScope, code: string, excludeId?: string): Promise<ServiceRecord | null>
  create(data: CreateServiceData): Promise<ServiceRecord>
  update(scope: TenantScope, id: string, data: UpdateServiceData): Promise<ServiceRecord | null>
  archive(scope: TenantScope, id: string, archivedAt: Date): Promise<ServiceRecord | null>
  restore(scope: TenantScope, id: string): Promise<ServiceRecord | null>
  branchExists(scope: TenantScope, branchId: string): Promise<boolean>
  enableBranchService(scope: TenantScope, data: BranchServiceData): Promise<BranchServiceRecord | null>
  findBranchService(scope: TenantScope, serviceId: string, branchId: string): Promise<BranchServiceRecord | null>
  findBranchServicePage(scope: TenantScope, serviceId: string, query: CatalogListQuery): Promise<PageResult<BranchServiceRecord>>
  updateBranchService(scope: TenantScope, serviceId: string, branchId: string, data: UpdateBranchServiceData): Promise<BranchServiceRecord | null>
  disableBranchService(scope: TenantScope, serviceId: string, branchId: string, disabledAt: Date): Promise<BranchServiceRecord | null>
  findSkillById(scope: TenantScope, id: string): Promise<Result<SkillRecord, NotFoundError>>
  findSkillByIdAnyStatus(scope: TenantScope, id: string): Promise<Result<SkillRecord, NotFoundError>>
  findSkillPage(scope: TenantScope, query: CatalogListQuery): Promise<PageResult<SkillRecord>>
  findActiveSkillByName(scope: TenantScope, name: string, excludeId?: string): Promise<SkillRecord | null>
  createSkill(data: CreateSkillData): Promise<SkillRecord>
  updateSkill(scope: TenantScope, id: string, data: UpdateSkillData): Promise<SkillRecord | null>
  archiveSkill(scope: TenantScope, id: string, archivedAt: Date): Promise<SkillRecord | null>
  restoreSkill(scope: TenantScope, id: string): Promise<SkillRecord | null>
  assignServiceSkill(scope: TenantScope, serviceId: string, skillId: string, id: string, requiredLevel: number | null): Promise<ServiceSkillRecord | null>
  removeServiceSkill(scope: TenantScope, serviceId: string, skillId: string): Promise<boolean>
  findServiceSkills(scope: TenantScope, serviceId: string): Promise<readonly ServiceSkillRecord[]>
}
export interface PaymentRepository extends Repository<PaymentRecord> {
  findPage(scope: TenantScope, query: PaymentListQuery): Promise<PageResult<PaymentRecord>>
  findBookingFinancials(scope: TenantScope, bookingId: string): Promise<CheckoutFinancialRecord | null>
  findByIdempotencyKey(scope: TenantScope, idempotencyKey: string): Promise<PaymentRecord | null>
  acquireFinancialLocks(scope: TenantScope, keys: readonly string[]): Promise<void>
  create(data: CreatePaymentData): Promise<PaymentRecord>
  createMany(data: readonly CreatePaymentData[]): Promise<readonly PaymentRecord[]>
  void(scope: TenantScope, paymentId: string, voidedAt: Date, reason: string): Promise<PaymentRecord | null>
  createRefund(scope: TenantScope, data: CreatePaymentRefundData): Promise<PaymentRefundRecord | null>
  updateRefundStatus(scope: TenantScope, paymentId: string, status: 'PARTIAL' | 'REFUNDED',
    refundedAt: Date): Promise<PaymentRecord | null>
  updateBookingPaymentStatus(scope: TenantScope, bookingId: string, status: PaymentStatusValue): Promise<boolean>
  closeSale(scope: TenantScope, bookingId: string, closedAt: Date, closedByUserId: string): Promise<boolean>
}

export interface CommissionRepository extends Repository<CommissionHistoryRecord> {
  acquireLocks(scope: TenantScope, keys: readonly string[]): Promise<void>
  findApplicableRule(scope: TenantScope, employeeId: string, serviceId: string,
    effectiveAt: Date): Promise<CommissionRuleRecord | null>
  findHistoryByBookingItem(scope: TenantScope, bookingItemId: string): Promise<CommissionHistoryRecord | null>
  findByBooking(scope: TenantScope, bookingId: string): Promise<readonly CommissionHistoryRecord[]>
  findByEmployee(scope: TenantScope, employeeId: string, startsAt?: Date,
    endsAt?: Date): Promise<readonly CommissionHistoryRecord[]>
  findPage(scope: TenantScope, query: CommissionListQuery): Promise<PageResult<CommissionHistoryRecord>>
  findEligibleBookingIds(scope: TenantScope, startsAt: Date, endsAt: Date,
    employeeId?: string): Promise<readonly string[]>
  createHistory(data: CreateCommissionHistoryData): Promise<CommissionHistoryRecord>
  createAdjustment(data: CreateCommissionAdjustmentData): Promise<CommissionAdjustmentRecord>
  findRefund(scope: TenantScope, refundId: string): Promise<PaymentRefundRecord | null>
  findRefundAdjustments(scope: TenantScope, refundId: string): Promise<readonly CommissionAdjustmentRecord[]>
  findOrCreatePeriod(scope: TenantScope, data: { id: string; startsAt: Date; endsAt: Date }): Promise<CommissionPeriodRecord>
  findPeriod(scope: TenantScope, startsAt: Date, endsAt: Date): Promise<CommissionPeriodRecord | null>
  findPeriodContaining(scope: TenantScope, instant: Date): Promise<CommissionPeriodRecord | null>
  createApproval(scope: TenantScope, data: { id: string; commissionHistoryId: string; commissionPeriodId: string;
    approvedByUserId: string; approvedAmount: string; reason: string; approvedAt: Date }): Promise<CommissionApprovalRecord | null>
  ledgerAmountForPeriod(scope: TenantScope, commissionHistoryId: string,
    startsAt: Date, endsAt: Date): Promise<string | null>
  countUnapprovedInPeriod(scope: TenantScope, startsAt: Date, endsAt: Date): Promise<number>
  markPeriodApproved(scope: TenantScope, periodId: string, userId: string, at: Date, reason: string): Promise<CommissionPeriodRecord | null>
  lockPeriod(scope: TenantScope, periodId: string, userId: string, at: Date, reason: string): Promise<CommissionPeriodRecord | null>
  summarize(scope: TenantScope, startsAt: Date, endsAt: Date, employeeId?: string): Promise<readonly CommissionSummaryRecord[]>
}

export interface RepositorySet {
  customers: CustomerRepository
  employees: EmployeeRepository
  bookings: BookingRepository
  services: ServiceRepository
  payments: PaymentRepository
  commissions: CommissionRepository
  dashboardReports: DashboardReportRepository
}
