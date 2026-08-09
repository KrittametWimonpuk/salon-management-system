# RBAC And Tenant Isolation

## Authorization Model

Permissions are loaded from `Permission -> RolePermission -> Role -> UserRole`. Controllers use the existing permission middleware, and every business use case independently evaluates the resource policy. Owner status never bypasses policy.

`UserRole.branchId = null` is an organization-wide grant. A UUID value limits the grant to that branch. The authenticated principal contains organization, employee, primary branch, and role grants with database-backed permissions.

## Required Permission Keys

Customer requires `customer.create`, `customer.read`, `customer.update`, `customer.archive`, `customer.restore`, and `customer.tag.manage`.

Employee requires:

- `employee.create`
- `employee.read`
- `employee.update`
- `employee.archive`
- `employee.restore`
- `employee.branch.manage`
- `employee.skill.manage`
- `employee.schedule.manage`

Service and Skill require:

- `service.category.manage`
- `service.create`
- `service.read`
- `service.update`
- `service.archive`
- `service.restore`
- `service.branch.manage`
- `service.skill.manage`
- `skill.create`
- `skill.read`
- `skill.update`
- `skill.archive`
- `skill.restore`

Booking requires:

- `booking.create`
- `booking.read`
- `booking.update`
- `booking.cancel`
- `booking.reschedule`
- `booking.status.update`
- `booking.availability.read`
- `booking.item.manage`

POS and Payment require:

- `payment.create`
- `payment.read`
- `payment.void`
- `payment.refund`
- `payment.checkout`
- `payment.close_sale`
- `pos.read`
- `pos.manage`

Commission requires:

- `commission.preview`
- `commission.calculate`
- `commission.read`
- `commission.recalculate`
- `commission.adjust`
- `commission.approve`
- `commission.lock`
- `commission.rule.read`
- `commission.rule.manage`
- `commission.summary.read`

These keys are operational requirements. The current project has no permission seed/onboarding mechanism, and Phase 3B modules do not alter RBAC data or migrations. Operators must provision permissions and role grants before enabling the endpoints. There is no hardcoded permission bypass.

## Branch Resolution

`X-Branch-ID` must identify an active branch in the authenticated organization and within the principal's grants. Organization-wide roles may select any active organization branch. Without a header, the existing tenant service resolves the principal's primary branch or the only accessible branch; ambiguous context returns `TENANT_002`.

Employee endpoints require resolved branch context. Resource policy checks organization, branch, and permission. Repository queries add organization and branch predicates and return not-found for inaccessible identifiers to avoid tenant enumeration.

Organization-wide employee time off (`branchId = null`) additionally requires an organization-wide role grant. Branch-scoped time off must match the resolved branch and an active employee assignment.

Service Category, Service, Service Skill, and Skill operations are organization-scoped unless a branch filter or BranchService route is used. Those branch operations require `X-Branch-ID`, matching branch grants, and a resource-policy check for the same branch.

All Booking operations require a resolved branch. Permission middleware checks the route permission and `BookingPolicy` repeats the organization, branch, and permission decision in the application layer. Repository predicates enforce organization and branch scope. Customer overlap detection intentionally spans branches within the authenticated organization.

All POS and Payment routes require a resolved branch. `PaymentPolicy` repeats the permission, organization, and branch decision inside every use case; repository predicates independently scope Booking, Payment, and PaymentRefund reads/writes. `pos.manage` is reserved for explicit financial-status reconciliation, while `payment.close_sale` controls close-sale state.

All Commission routes require a resolved branch. Route middleware and `CommissionPolicy` both enforce the operation permission, while `CommissionRepository` independently scopes every history, adjustment, approval, period, rule, refund, and summary query. Lock does not imply permission bypass and Owner has no special exemption. Commission permission provisioning remains an operational requirement.
