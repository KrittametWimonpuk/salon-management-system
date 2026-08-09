# Employee Module

## Scope

Phase 3B.2 implements employee profiles, multi-branch assignment, existing-skill assignment, working hours, and time off. It adds no schema, migration, authentication/RBAC architecture, booking, payment, commission, dashboard, report, UI, Service CRUD, or Skill CRUD.

## Use Cases

Core: `CreateEmployee`, `UpdateEmployee`, `GetEmployee`, `GetEmployeeList`, `SearchEmployee`, `ArchiveEmployee`, and `RestoreEmployee`.

Branch: `AssignEmployeeToBranch`, `RemoveEmployeeFromBranch`, and `SetPrimaryEmployeeBranch`.

Skill: `AssignEmployeeSkill` and `RemoveEmployeeSkill`.

Schedule: `SetWorkingHour`, `UpdateWorkingHour`, `RemoveWorkingHour`, `CreateEmployeeTimeOff`, and `CancelEmployeeTimeOff`.

Every write executes through `TransactionManager`; every use case uses `EmployeeRepository`, `EmployeePolicy`, and `Result`. Events publish after commit through the in-process dispatcher.

## Employee Rules

- Create requires resolved branch context and creates that active Primary Branch in the same transaction.
- `displayName` is the operational nickname/search name because the frozen schema has no nickname column.
- Employment status is `ACTIVE`, `INACTIVE`, or `TERMINATED`. `ARCHIVED` is derived from `deletedAt`.
- Archive changes only `deletedAt`. Branches, skills, schedules, and time off remain historical and are restored with the employee.
- Archived employees cannot receive new branches, skills, working hours, or time off.
- Employee hard delete is not exposed.

## Branch Rules

- Every assignment validates Employee and Branch organization ownership.
- A new employee starts with exactly one primary assignment.
- The existing partial unique index permits at most one active Primary Branch.
- Setting a new primary demotes the old assignment inside one serializable transaction.
- A primary assignment cannot be removed; set another primary first.
- Assignment removal uses `isActive=false` and `deletedAt`, never hard delete.
- Branch query/input must match the resolved branch context. Assigning a previously unassigned employee loads it by organization scope, then authorizes the target branch before writing.

## Skill Rules

- Only an active, non-deleted Skill in the same organization can be assigned.
- Proficiency is optional and limited to 1 through 5.
- Certification expiry cannot precede certification date.
- Reassigning a soft-deleted EmployeeSkill restores it; active duplicates return conflict.
- Removal is soft delete. Skill catalog management remains Phase 3B.3.

## Working Hours

- `dayOfWeek` uses `0=Sunday` through `6=Saturday`.
- Times use `HH:mm:ss`; `endTime` must be after `startTime`, so overnight shifts are not supported.
- Employee must have an active assignment to the resolved branch.
- Two active rows conflict when employee/branch/day match, time intervals overlap, and effective-date ranges overlap.
- Effective end cannot precede effective start. Removal sets `isActive=false` and `deletedAt`.

## Time Off

- `endsAt` must be after `startsAt`.
- A branch-specific request must match branch context and active employee assignment.
- `branchId=null` represents organization-wide leave and requires an organization-wide role grant.
- This phase intentionally permits overlapping time-off rows because no overlap prohibition was specified.
- Only `PENDING` or `APPROVED` rows can transition to `CANCELLED`; cancellation does not hard delete.

## Events

`EmployeeCreated`, `EmployeeUpdated`, `EmployeeArchived`, `EmployeeRestored`, `EmployeeAssignedToBranch`, `EmployeeRemovedFromBranch`, `EmployeePrimaryBranchChanged`, `EmployeeSkillAssigned`, `EmployeeSkillRemoved`, `EmployeeWorkingHourSet`, `EmployeeWorkingHourRemoved`, `EmployeeTimeOffCreated`, and `EmployeeTimeOffCancelled`.

## Error Cases

Zod failures return `VALIDATION_001`. Missing scoped resources return `HTTP_404`. Policy failures return `PERMISSION_001` or `TENANT_003`. Duplicate assignments and overlapping schedules return `DOMAIN_001`. Invalid lifecycle transitions return `DOMAIN_002`; serializable conflicts return `DOMAIN_003`.

## Audit

Routes attach explicit actions such as `employee.created`, `employee.branch.assigned`, `employee.skill.removed`, `employee.working_hour.set`, and `employee.time_off.cancelled`. The existing audit middleware writes after response completion; use cases never write AuditLog directly.
