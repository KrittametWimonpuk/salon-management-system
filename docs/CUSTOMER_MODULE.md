# Customer Module

## Scope

Phase 3B.1 implements Customer only. It uses the frozen application foundation and adds no schema, migration, authentication, RBAC architecture, booking, employee, payment, commission, report, dashboard, or UI behavior.

## Use Cases

| Use case | Repository | Transaction | Permission | Event |
| --- | --- | --- | --- | --- |
| `CreateCustomer` | create and phone check | Yes | `customer.create` | `CustomerCreated` |
| `UpdateCustomer` | active lookup/update | Yes | `customer.update` | `CustomerUpdated` |
| `GetCustomer` | active lookup | No | `customer.read` | - |
| `GetCustomerList` | paginated lookup | No | `customer.read` | - |
| `SearchCustomer` | filtered lookup | No | `customer.read` | - |
| `ArchiveCustomer` | soft delete | Yes | `customer.archive` | `CustomerArchived` |
| `RestoreCustomer` | restore and phone check | Yes | `customer.restore` | `CustomerRestored` |
| `AssignCustomerTag` | active tag assignment | Yes | `customer.tag.manage` | `CustomerTagAssigned` |
| `RemoveCustomerTag` | soft-delete assignment | Yes | `customer.tag.manage` | `CustomerTagRemoved` |

Events are published through the in-process foundation dispatcher after a successful commit. No queue or outbox persistence is introduced.

## Business Rules

1. Every repository operation requires `organizationId`; inaccessible identifiers return `NotFoundError` to prevent tenant enumeration.
2. Customers are organization-scoped. Branch context only restricts changes to `preferredBranchId`, which must match the resolved branch.
3. Customer and tag-assignment deletion is soft delete only.
4. `ACTIVE` means `deletedAt IS NULL`; `ARCHIVED` means `deletedAt IS NOT NULL`.
5. Phone values are trimmed and have spaces, hyphens, and parentheses removed before storage.
6. Phone is unique among active customers in an organization. Archived records release the phone; restore rechecks it.
7. `customerNumber` is required input. Automatic number allocation is outside this phase.
8. Tags must be active, not deleted, and belong to the same organization.

## Concurrent Phone Creation

Writes run through `TransactionManager` at `SERIALIZABLE` isolation. The Prisma Customer repository takes a transaction-scoped PostgreSQL advisory lock derived from `organizationId` and normalized phone before checking duplicates. Concurrent integration tests assert that only one active customer is committed.

Because the schema is frozen, there is no database unique index for `(organizationId, phone)`. The guarantee applies to writes using this application transaction path. Direct SQL or another writer can bypass it; a partial unique index remains the recommended future schema hardening.

## Validation And Results

HTTP body, path, and query validation use strict Zod schemas. Use cases receive validated inputs and return `Result<T, DomainError>`. Expected validation, conflict, not-found, forbidden, business-rule, concurrency, and tenant failures are mapped to the standard API error response.

## API Example

```json
POST /api/customers
{
  "customerNumber": "CUS-001",
  "firstName": "Ada",
  "lastName": "Lovelace",
  "phone": "081-234-5678",
  "email": "ada@example.com",
  "preferredBranchId": "00000000-0000-4000-8000-000000000001"
}
```

Assigning a tag uses `{ "tagId": "<uuid>" }`. Search and pagination details are maintained in `docs/API.md`.

## Audit

Routes set `customer.create`, `customer.update`, `customer.archive`, `customer.restore`, `customer.tag.assign`, or `customer.tag.remove` in response audit context. The existing audit middleware records actor, organization, branch, request identifiers, outcome, and duration.

## RBAC Provisioning

The module consumes the six permission keys listed above. This phase does not modify RBAC records or migrations. Deployments must provision these permission records and role grants through the existing RBAC administration process before users can access Customer endpoints.
