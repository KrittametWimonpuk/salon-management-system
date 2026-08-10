let activeBranchId: string | null = null

export function getActiveBranchId(): string | null {
  return activeBranchId
}

export function setActiveBranchId(branchId: string | null): void {
  activeBranchId = branchId
}
