import { ForbiddenError, TenantIsolationError, type DomainError } from '../../domain/foundation/domain-errors.js'
import { failure, success, type Result } from '../../domain/foundation/result.js'

export interface PolicySubject {
  userId: string
  organizationId: string
  branchIds: ReadonlySet<string>
  permissions: ReadonlySet<string>
}

export interface PolicyAction {
  permission: string
  allowOwner?: boolean
}

export interface ScopedResource {
  organizationId: string
  branchId?: string | null
  ownerId?: string | null
}

export interface ResourcePolicy<TResource extends ScopedResource> {
  evaluate(subject: PolicySubject, action: PolicyAction, resource: TResource): Result<void, DomainError>
}

export class PolicyEngine {
  authorize<TResource extends ScopedResource>(
    policy: ResourcePolicy<TResource>,
    subject: PolicySubject,
    action: PolicyAction,
    resource: TResource,
  ): Result<void, DomainError> {
    return policy.evaluate(subject, action, resource)
  }
}

abstract class ScopedResourcePolicy<TResource extends ScopedResource> implements ResourcePolicy<TResource> {
  evaluate(subject: PolicySubject, action: PolicyAction, resource: TResource): Result<void, DomainError> {
    if (subject.organizationId !== resource.organizationId) {
      return failure(new TenantIsolationError('Resource belongs to another organization'))
    }
    if (resource.branchId && !subject.branchIds.has(resource.branchId)) {
      return failure(new TenantIsolationError('Resource belongs to an inaccessible branch'))
    }
    const isOwner = action.allowOwner === true && resource.ownerId === subject.userId
    if (!isOwner && !subject.permissions.has(action.permission)) {
      return failure(new ForbiddenError('Required permission is missing', { permission: action.permission }))
    }
    return success(undefined)
  }
}

export interface BookingPolicyResource extends ScopedResource {
  branchId: string
  ownerId: string | null
}

export type CustomerPolicyResource = ScopedResource

export interface EmployeePolicyResource extends ScopedResource {
  branchId: string
  ownerId: string | null
}

export type ServicePolicyResource = ScopedResource
export interface PaymentPolicyResource extends ScopedResource {
  branchId: string
  ownerId: string | null
}
export interface CommissionPolicyResource extends ScopedResource {
  branchId: string
  ownerId: null
}
export type DashboardReportPolicyResource = ScopedResource

export class BookingPolicy extends ScopedResourcePolicy<BookingPolicyResource> {}
export class CustomerPolicy extends ScopedResourcePolicy<CustomerPolicyResource> {}
export class EmployeePolicy extends ScopedResourcePolicy<EmployeePolicyResource> {}
export class ServicePolicy extends ScopedResourcePolicy<ServicePolicyResource> {}
export class PaymentPolicy extends ScopedResourcePolicy<PaymentPolicyResource> {}
export class CommissionPolicy extends ScopedResourcePolicy<CommissionPolicyResource> {}
export class DashboardReportPolicy extends ScopedResourcePolicy<DashboardReportPolicyResource> {}
