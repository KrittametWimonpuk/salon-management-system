# Service And Skill Module

## Scope

Phase 3B.3 implements the organization service catalog, categories, branch availability/overrides, skills, and required-skill mappings. It does not add or change database schema, migrations, authentication, RBAC architecture, booking, payment, commission, promotion, reporting, dashboard, or UI behavior.

## Use Cases

Service Category: `CreateServiceCategory`, `UpdateServiceCategory`, `GetServiceCategory`, `GetServiceCategoryList`, `ArchiveServiceCategory`, and `RestoreServiceCategory`.

Service: `CreateService`, `UpdateService`, `GetService`, `GetServiceList`, `SearchService`, `ArchiveService`, and `RestoreService`.

Branch Service: `EnableServiceForBranch`, `UpdateBranchService`, `DisableServiceForBranch`, and `GetBranchServiceList`.

Skill: `CreateSkill`, `UpdateSkill`, `GetSkill`, `GetSkillList`, `SearchSkill`, `ArchiveSkill`, and `RestoreSkill`.

Service Skill: `AssignSkillToService`, `RemoveSkillFromService`, and `GetServiceRequiredSkills`.

Every use case evaluates `ServicePolicy` and accesses persistence through `ServiceRepository`. Every write uses `TransactionManager.withTransaction()`. Expected failures are returned as `Result` failures; events are published after commit through the in-process dispatcher.

## Service Category Rules

- Category names are case-insensitively unique among non-archived rows within an organization.
- Archive sets `isActive=false` and `deletedAt` without cascading to existing services.
- Archived categories remain readable with `ARCHIVED` or `ALL` status but cannot receive new or moved services.
- Restore rechecks active-name uniqueness and returns conflict when another active category owns the name.

## Service Rules

- Every service belongs to an active category in the same organization.
- Active service names and codes are case-insensitively unique within an organization through locked serializable writes. The frozen database has a partial unique index for code, but not name.
- Duration must be positive; buffers and price cannot be negative.
- Lifecycle filters are `ACTIVE`, `INACTIVE`, `ARCHIVED`, and `ALL`. `ARCHIVED` is derived from `deletedAt`.
- Archive preserves BranchService and ServiceSkill associations. Archived services cannot be enabled for a branch or have required skills assigned/removed.
- Restore requires its category to be active and rechecks name/code conflicts.

## Branch Service Rules

- Branch and Service must belong to the same organization; the target branch must match resolved branch context.
- `priceOverride=null` and `durationOverrideMinutes=null` inherit Service values. Responses include `effectivePrice` and `effectiveDurationMinutes`.
- Override price is non-negative and override duration is positive.
- The unique branch/service row is reactivated when previously disabled. Active duplicates return conflict.
- Disable uses `isActive=false` and `deletedAt`; it never deletes the row.
- Branch-service list endpoints require branch context and return only that resolved branch.

## Skill Rules

- Active skill names are case-insensitively unique within an organization.
- Archive preserves existing EmployeeSkill and ServiceSkill references but prevents new assignments.
- Restore rechecks active-name uniqueness.
- Skill reads can include archived history through status filters.

## Service Skill Rules

- Service and Skill must both be active and belong to the same organization when assigning.
- `requiredLevel` is optional; when present it is 1 through 5. Null means the skill is required without a minimum level.
- Duplicate service/skill mappings return conflict.
- The frozen `ServiceSkill` model has no `deletedAt` or `isActive`. `RemoveSkillFromService` therefore hard-deletes only this join row as the explicitly approved exception. It never deletes Service or Skill.

## Tax Defaults

Tax is stored on Service because BranchService has no tax columns in the frozen schema. Create requires explicit `taxType`, `taxMode`, and `taxRate`. `NONE` requires rate `0`; `VAT` requires a rate greater than `0` and at most `100`. `INCLUDED` and `EXCLUDED` are stored for the future BookingItem snapshot. This phase performs no tax calculation.

## Search And Branch Context

Category and Skill lists support keyword, lifecycle status, pagination, sorting, and order. Service search additionally supports `categoryId`, `branchId`, and `skillId`; keyword covers service, category, branch, and skill names. A branch filter requires `X-Branch-ID` with the same UUID. Organization-scoped catalog operations can run without branch context when an organization-wide permission grant exists.

## Events

`ServiceCategoryCreated`, `ServiceCategoryUpdated`, `ServiceCategoryArchived`, `ServiceCategoryRestored`, `ServiceCreated`, `ServiceUpdated`, `ServiceArchived`, `ServiceRestored`, `BranchServiceEnabled`, `BranchServiceUpdated`, `BranchServiceDisabled`, `SkillCreated`, `SkillUpdated`, `SkillArchived`, `SkillRestored`, `ServiceSkillAssigned`, and `ServiceSkillRemoved`.

## Error Cases

Zod failures return `VALIDATION_001`. Missing scoped resources return `HTTP_404`. Permission and tenant failures return `PERMISSION_001` or `TENANT_003`. Duplicate names, codes, and mappings return `DOMAIN_001`. Invalid category, service, skill, tax, or lifecycle states return `DOMAIN_002`. Serializable transaction conflicts return `DOMAIN_003` and are safe for the caller to retry.

## Audit

Every write route supplies an explicit action to the existing audit middleware, including `service_category.created`, `service.updated`, `branch_service.disabled`, `skill.restored`, and `service_skill.removed`. Use cases never write AuditLog directly.
