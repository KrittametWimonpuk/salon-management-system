export const EmployeeEventName = {
  CREATED: 'EmployeeCreated', UPDATED: 'EmployeeUpdated', ARCHIVED: 'EmployeeArchived', RESTORED: 'EmployeeRestored',
  BRANCH_ASSIGNED: 'EmployeeAssignedToBranch', BRANCH_REMOVED: 'EmployeeRemovedFromBranch',
  PRIMARY_BRANCH_CHANGED: 'EmployeePrimaryBranchChanged', SKILL_ASSIGNED: 'EmployeeSkillAssigned',
  SKILL_REMOVED: 'EmployeeSkillRemoved', WORKING_HOUR_SET: 'EmployeeWorkingHourSet',
  WORKING_HOUR_REMOVED: 'EmployeeWorkingHourRemoved', TIME_OFF_CREATED: 'EmployeeTimeOffCreated',
  TIME_OFF_CANCELLED: 'EmployeeTimeOffCancelled',
} as const

