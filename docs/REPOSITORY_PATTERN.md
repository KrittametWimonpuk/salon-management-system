# Repository Pattern

## Contract

`Repository<TEntity, TId>` provides a type-safe base `findById(scope, id)` contract. Specialized aliases exist for Customer, Employee, Booking, Service, and Payment. The records are application-owned projections and do not import Prisma types.

All calls require `TenantScope.organizationId`. `branchId` is optional because Customer and Service can be organization-wide, while Employee, Booking, and Payment may be branch-scoped.

## Implementations

| Repository | Organization boundary | Optional branch boundary | Soft delete |
| --- | --- | --- | --- |
| Customer | `Customer.organizationId` | Policy/use-case dependent | `deletedAt IS NULL` |
| Employee | `Employee.organizationId` | Active `EmployeeBranch` | `deletedAt IS NULL` |
| Booking | `Booking.branch.organizationId` | `Booking.branchId` | Booking and Branch |
| Service | `Service.organizationId` | Active `BranchService` | Service and BranchService |
| Payment | `Payment.booking.branch.organizationId` | Booking branch | Booking and Branch |

Scoped queries return `NotFoundError` for both absent and inaccessible records. This avoids revealing whether another tenant owns an identifier. Resource policies perform explicit tenant checks only after an authorized resource has already been loaded.

## Rules For New Repositories

1. Define records and interfaces in the application layer without Prisma imports.
2. Require tenant scope on every tenant-owned query.
3. Apply soft-delete filters consistently.
4. Map `Decimal` and persistence-specific values at the adapter boundary.
5. Add repository methods only for a concrete use case; do not grow a generic CRUD surface.
6. Use repositories supplied by `TransactionScope` for atomic work.

Pagination, sorting, filtering, and search contracts live in `application/foundation/query.ts`. Concrete allowlists and query mapping are deferred until an actual Phase 3B use case exists.

