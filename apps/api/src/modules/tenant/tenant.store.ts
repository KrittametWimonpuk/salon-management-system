import type { PrismaClient } from '@prisma/client'

export interface AccessibleBranch {
  id: string
  name: string
}

export interface TenantStore {
  findAccessibleBranches(organizationId: string, branchIds: string[] | null): Promise<AccessibleBranch[]>
}

export class PrismaTenantStore implements TenantStore {
  constructor(private readonly database: PrismaClient) {}

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
