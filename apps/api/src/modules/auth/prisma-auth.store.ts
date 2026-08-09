import type { PrismaClient } from '@prisma/client'
import type { AuthenticatedPrincipal, RoleGrant } from '../../shared/types/context.js'
import type { AuthStore, CredentialUser, NewSession, RotateSessionResult } from './auth.types.js'

export class PrismaAuthStore implements AuthStore {
  constructor(private readonly database: PrismaClient) {}

  async findActiveUser(organizationId: string, email: string): Promise<CredentialUser | null> {
    return this.database.user.findFirst({
      where: {
        organizationId,
        email: { equals: email, mode: 'insensitive' },
        status: 'ACTIVE',
        deletedAt: null,
        organization: { deletedAt: null },
      },
      select: {
        id: true,
        organizationId: true,
        email: true,
        passwordHash: true,
        displayName: true,
      },
    })
  }

  async createSession(session: NewSession): Promise<void> {
    await this.database.authSession.create({ data: session })
  }

  async rotateSession(current: {
    sessionId: string
    userId: string
    organizationId: string
    tokenFamilyId: string
    refreshTokenHash: string
  }, next: NewSession): Promise<RotateSessionResult> {
    return this.database.$transaction(async (transaction) => {
      const now = new Date()
      const session = await transaction.authSession.findUnique({
        where: { id: current.sessionId },
        select: {
          userId: true,
          tokenFamilyId: true,
          refreshTokenHash: true,
          expiresAt: true,
          revokedAt: true,
          user: { select: { organizationId: true, status: true, deletedAt: true } },
        },
      })
      if (!session
        || session.userId !== current.userId
        || session.user.organizationId !== current.organizationId
        || session.user.status !== 'ACTIVE'
        || session.user.deletedAt !== null
        || session.expiresAt <= now) {
        return { status: 'invalid' } as const
      }
      if (session.tokenFamilyId !== current.tokenFamilyId
        || session.refreshTokenHash !== current.refreshTokenHash
        || session.revokedAt !== null) {
        await transaction.authSession.updateMany({
          where: { tokenFamilyId: session.tokenFamilyId, revokedAt: null },
          data: { revokedAt: now, revocationReason: 'TOKEN_REUSE_DETECTED' },
        })
        return { status: 'reused' } as const
      }

      const claimed = await transaction.authSession.updateMany({
        where: {
          id: current.sessionId,
          userId: current.userId,
          tokenFamilyId: current.tokenFamilyId,
          refreshTokenHash: current.refreshTokenHash,
          revokedAt: null,
          expiresAt: { gt: now },
        },
        data: {
          revokedAt: now,
          revocationReason: 'ROTATED',
          lastUsedAt: now,
        },
      })

      if (claimed.count !== 1) {
        await transaction.authSession.updateMany({
          where: { tokenFamilyId: current.tokenFamilyId, revokedAt: null },
          data: { revokedAt: now, revocationReason: 'TOKEN_REUSE_DETECTED' },
        })
        return { status: 'reused' } as const
      }

      await transaction.authSession.create({ data: next })
      await transaction.authSession.update({
        where: { id: current.sessionId },
        data: { rotatedToSessionId: next.id },
      })
      return { status: 'rotated' } as const
    }, { isolationLevel: 'Serializable' })
  }

  async revokeSession(sessionId: string, userId: string, reason: string): Promise<void> {
    await this.database.authSession.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: new Date(), revocationReason: reason },
    })
  }

  async loadPrincipal(
    userId: string,
    organizationId: string,
    sessionId: string,
  ): Promise<AuthenticatedPrincipal | null> {
    const now = new Date()
    const user = await this.database.user.findFirst({
      where: {
        id: userId,
        organizationId,
        status: 'ACTIVE',
        deletedAt: null,
        organization: { deletedAt: null },
        authSessions: { some: { id: sessionId, revokedAt: null, expiresAt: { gt: now } } },
      },
      select: {
        id: true,
        organizationId: true,
        email: true,
        displayName: true,
        employee: {
          select: {
            id: true,
            branchAssignments: {
              where: { isPrimary: true, isActive: true, deletedAt: null, branch: { isActive: true, deletedAt: null } },
              select: { branchId: true },
              take: 1,
            },
          },
        },
        roleAssignments: {
          where: { deletedAt: null, role: { isActive: true, deletedAt: null } },
          select: {
            branchId: true,
            role: {
              select: {
                id: true,
                name: true,
                rolePermissions: {
                  where: { deletedAt: null, permission: { isActive: true, deletedAt: null } },
                  select: { permission: { select: { key: true } } },
                },
              },
            },
          },
        },
      },
    })

    if (!user) return null
    const grants: RoleGrant[] = user.roleAssignments.map((assignment) => ({
      roleId: assignment.role.id,
      roleName: assignment.role.name,
      branchId: assignment.branchId,
      permissions: assignment.role.rolePermissions.map((item) => item.permission.key),
    }))

    return {
      userId: user.id,
      organizationId: user.organizationId,
      sessionId,
      email: user.email,
      displayName: user.displayName,
      employeeId: user.employee?.id ?? null,
      primaryBranchId: user.employee?.branchAssignments[0]?.branchId ?? null,
      grants,
    }
  }
}
