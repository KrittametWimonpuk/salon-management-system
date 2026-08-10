import type { AuthenticatedPrincipal } from '../../src/shared/types/context.js'
import type {
  AuthStore,
  CredentialUser,
  NewSession,
  RotateSessionResult,
} from '../../src/modules/auth/auth.types.js'
import type { AccessibleBranch, TenantStore } from '../../src/modules/tenant/tenant.store.js'

export const ids = {
  organization: '10000000-0000-4000-8000-000000000001',
  otherOrganization: '10000000-0000-4000-8000-000000000002',
  user: '20000000-0000-4000-8000-000000000001',
  branch: '30000000-0000-4000-8000-000000000001',
  otherBranch: '30000000-0000-4000-8000-000000000002',
  role: '40000000-0000-4000-8000-000000000001',
}

interface StoredSession extends NewSession {
  revoked: boolean
  reason?: string
}

export class FakeAuthStore implements AuthStore {
  user: CredentialUser | null = {
    id: ids.user,
    organizationId: ids.organization,
    email: 'owner@example.test',
    passwordHash: 'valid-hash',
    displayName: 'Owner',
  }
  readonly sessions = new Map<string, StoredSession>()

  async findActiveUser(organizationId: string, email: string): Promise<CredentialUser | null> {
    if (this.user?.organizationId !== organizationId || this.user.email !== email) return null
    return this.user
  }

  async createSession(session: NewSession): Promise<void> {
    this.sessions.set(session.id, { ...session, revoked: false })
  }

  async rotateSession(current: {
    sessionId: string
    userId: string
    organizationId: string
    tokenFamilyId: string
    refreshTokenHash: string
  }, next: NewSession): Promise<RotateSessionResult> {
    const session = this.sessions.get(current.sessionId)
    if (!session || session.userId !== current.userId || current.organizationId !== ids.organization) {
      return { status: 'invalid' }
    }
    if (session.revoked
      || session.tokenFamilyId !== current.tokenFamilyId
      || session.refreshTokenHash !== current.refreshTokenHash) {
      for (const item of this.sessions.values()) {
        if (item.tokenFamilyId === session.tokenFamilyId) {
          item.revoked = true
          item.reason = 'TOKEN_REUSE_DETECTED'
        }
      }
      return { status: 'reused' }
    }
    session.revoked = true
    session.reason = 'ROTATED'
    this.sessions.set(next.id, { ...next, revoked: false })
    return { status: 'rotated' }
  }

  async revokeSession(sessionId: string, userId: string, reason: string): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (session?.userId === userId) {
      session.revoked = true
      session.reason = reason
    }
  }

  async loadPrincipal(
    userId: string,
    organizationId: string,
    sessionId: string,
  ): Promise<AuthenticatedPrincipal | null> {
    const session = this.sessions.get(sessionId)
    if (!session || session.revoked || userId !== ids.user || organizationId !== ids.organization) return null
    return {
      userId,
      organizationId,
      sessionId,
      email: 'owner@example.test',
      displayName: 'Owner',
      employeeId: null,
      primaryBranchId: ids.branch,
      grants: [{
        roleId: ids.role,
        roleName: 'Owner',
        branchId: null,
        permissions: ['booking.read', 'setting.manage'],
      }],
    }
  }
}

export class FakeTenantStore implements TenantStore {
  lastOrganizationId: string | null = null
  organization = { id: ids.organization, name: 'Salon Test Organization' }
  branches: AccessibleBranch[] = [{ id: ids.branch, name: 'Main Branch' }]

  async findOrganization(organizationId: string) {
    this.lastOrganizationId = organizationId
    return this.organization.id === organizationId ? this.organization : null
  }

  async findAccessibleBranches(organizationId: string, branchIds: string[] | null): Promise<AccessibleBranch[]> {
    this.lastOrganizationId = organizationId
    return this.branches.filter((branch) => branchIds === null || branchIds.includes(branch.id))
  }
}
