import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { AuthService } from '../../src/modules/auth/auth.service.js'
import { BcryptPasswordService } from '../../src/modules/auth/password.service.js'
import { PrismaAuthStore } from '../../src/modules/auth/prisma-auth.store.js'
import { TokenService } from '../../src/modules/auth/token.service.js'
import { PrismaTenantStore } from '../../src/modules/tenant/tenant.store.js'
import { TenantService } from '../../src/modules/tenant/tenant.service.js'
import { testConfig } from '../helpers/config.js'

const databaseUrl = process.env.TEST_DATABASE_URL
const database = databaseUrl
  ? new PrismaClient({ datasources: { db: { url: databaseUrl } } })
  : null

describe.runIf(database !== null)('Prisma authentication and tenant integration', () => {
  beforeAll(async () => {
    await database!.$connect()
  })

  beforeEach(async () => {
    const organizations = await database!.organization.findMany({
      where: { name: { in: ['Integration Organization', 'Isolated Organization'] } },
      select: { id: true },
    })
    const organizationIds = organizations.map(({ id }) => id)
    if (organizationIds.length) {
      const users = await database!.user.findMany({
        where: { organizationId: { in: organizationIds } }, select: { id: true },
      })
      const roles = await database!.role.findMany({
        where: { organizationId: { in: organizationIds } }, select: { id: true },
      })
      const userIds = users.map(({ id }) => id)
      const roleIds = roles.map(({ id }) => id)
      await database!.$transaction([
        database!.authSession.deleteMany({ where: { userId: { in: userIds } } }),
        database!.userRole.deleteMany({ where: { OR: [{ userId: { in: userIds } }, { roleId: { in: roleIds } }] } }),
        database!.rolePermission.deleteMany({ where: { roleId: { in: roleIds } } }),
        database!.role.deleteMany({ where: { id: { in: roleIds } } }),
        database!.user.deleteMany({ where: { id: { in: userIds } } }),
        database!.branch.deleteMany({ where: { organizationId: { in: organizationIds } } }),
        database!.organization.deleteMany({ where: { id: { in: organizationIds } } }),
      ])
    }
    await database!.permission.deleteMany({ where: { description: 'Read bookings' } })
  })

  afterAll(async () => {
    await database!.$disconnect()
  })

  it('persists rotation, loads database permissions, and isolates branches by organization', async () => {
    const organization = await database!.organization.create({
      data: { name: 'Integration Organization', timezone: 'Asia/Bangkok', currency: 'THB' },
    })
    const branch = await database!.branch.create({
      data: {
        organizationId: organization.id,
        code: 'MAIN',
        name: 'Main Branch',
        countryCode: 'TH',
      },
    })
    const otherOrganization = await database!.organization.create({
      data: { name: 'Isolated Organization', timezone: 'Asia/Bangkok', currency: 'THB' },
    })
    await database!.branch.create({
      data: {
        organizationId: otherOrganization.id,
        code: 'OTHER',
        name: 'Other Branch',
        countryCode: 'TH',
      },
    })
    const user = await database!.user.create({
      data: {
        organizationId: organization.id,
        email: 'integration@example.test',
        passwordHash: await bcrypt.hash('correct-password', 12),
        status: 'ACTIVE',
      },
    })
    const permission = await database!.permission.create({
      data: { key: 'booking.read', description: 'Read bookings' },
    })
    const role = await database!.role.create({
      data: { organizationId: organization.id, name: 'Owner' },
    })
    await database!.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } })
    await database!.userRole.create({ data: { userId: user.id, roleId: role.id } })

    const config = testConfig()
    const store = new PrismaAuthStore(database!)
    const auth = new AuthService(store, new BcryptPasswordService(), new TokenService(config.jwt), config.jwt)
    const login = await auth.login({
      organizationId: organization.id,
      email: user.email,
      password: 'correct-password',
    })
    const principal = await auth.authenticate(login.accessToken)
    expect(principal.grants[0]?.permissions).toContain('booking.read')

    const rotated = await auth.refresh(login.refreshToken)
    expect(rotated.refreshToken).not.toBe(login.refreshToken)
    expect(await database!.authSession.count()).toBe(2)

    const tenant = new TenantService(new PrismaTenantStore(database!))
    const context = await tenant.resolveBranch(principal, branch.id, true)
    const workspace = await tenant.getWorkspaceContext(principal)
    expect(context?.branchId).toBe(branch.id)
    expect(workspace.organization).toEqual({
      id: organization.id,
      name: 'Integration Organization',
      displayName: 'Integration Organization',
    })
    expect(workspace.branches.map(({ id }) => id)).toEqual([branch.id])
    expect(await database!.branch.count({ where: { organizationId: organization.id } })).toBe(1)
  })
})
