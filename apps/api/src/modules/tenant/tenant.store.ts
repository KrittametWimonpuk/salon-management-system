import type { PrismaClient } from '@prisma/client'

export interface AccessibleBranch {
  id: string
  name: string
}

export interface TenantOrganization {
  id: string
  name: string
}

export interface TenantStore {
  findOrganization(organizationId: string): Promise<TenantOrganization | null>
  findAccessibleBranches(organizationId: string, branchIds: string[] | null): Promise<AccessibleBranch[]>
}

export class PrismaTenantStore implements TenantStore {
  constructor(private readonly database: PrismaClient) {}

  async findOrganization(organizationId: string): Promise<TenantOrganization | null> {
    return this.database.organization.findFirst({
      where: { id: organizationId, deletedAt: null },
      select: { id: true, name: true },
    })
  }

  async findAccessibleBranches(organizationId: string, branchIds: string[] | null): Promise<AccessibleBranch[]> {
    if (branchIds !== null && branchIds.length === 0) return []
    return this.database.branch.findMany({
      where: {
        organizationId,
        ...(branchIds === null ? {} : { id: { in: branchIds } }),
        isActive: true,
        deletedAt: null,
      },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    })
  }
}
