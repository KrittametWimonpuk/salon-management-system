export const ServiceCatalogEventName = {
  CATEGORY_CREATED: 'ServiceCategoryCreated', CATEGORY_UPDATED: 'ServiceCategoryUpdated',
  CATEGORY_ARCHIVED: 'ServiceCategoryArchived', CATEGORY_RESTORED: 'ServiceCategoryRestored',
  SERVICE_CREATED: 'ServiceCreated', SERVICE_UPDATED: 'ServiceUpdated', SERVICE_ARCHIVED: 'ServiceArchived',
  SERVICE_RESTORED: 'ServiceRestored', BRANCH_ENABLED: 'BranchServiceEnabled',
  BRANCH_UPDATED: 'BranchServiceUpdated', BRANCH_DISABLED: 'BranchServiceDisabled',
  SKILL_CREATED: 'SkillCreated', SKILL_UPDATED: 'SkillUpdated', SKILL_ARCHIVED: 'SkillArchived',
  SKILL_RESTORED: 'SkillRestored', SERVICE_SKILL_ASSIGNED: 'ServiceSkillAssigned',
  SERVICE_SKILL_REMOVED: 'ServiceSkillRemoved',
} as const
