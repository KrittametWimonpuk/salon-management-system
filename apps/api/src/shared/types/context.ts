export interface RequestContext {
  requestId: string
  correlationId: string
  startedAt: number
}

export interface RoleGrant {
  roleId: string
  roleName: string
  branchId: string | null
  permissions: string[]
}

export interface AuthenticatedPrincipal {
  userId: string
  organizationId: string
  sessionId: string
  email: string
  displayName: string | null
  employeeId: string | null
  primaryBranchId: string | null
  grants: RoleGrant[]
}

export interface BranchContext {
  branchId: string
  branchName: string
  roles: string[]
  permissions: string[]
}

export interface AuditContext {
  organizationId: string
  userId?: string
  branchId?: string
  action?: string
}
