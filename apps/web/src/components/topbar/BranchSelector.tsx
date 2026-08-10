import { Building2, LoaderCircle } from 'lucide-react'
import { useBranch } from '../../branch/useBranch'

export function BranchSelector() {
  const { accessibleBranches, currentBranch, isLoading, setCurrentBranch } = useBranch()

  return (
    <label className="branch-selector">
      <Building2 size={17} aria-hidden="true" />
      <span className="sr-only">สาขาปัจจุบัน</span>
      <select
        aria-label="สาขาปัจจุบัน"
        value={currentBranch?.id ?? ''}
        disabled={isLoading || accessibleBranches.length === 0}
        onChange={(event) => { void setCurrentBranch(event.target.value) }}
      >
        {!currentBranch && <option value="">เลือกสาขา</option>}
        {accessibleBranches.map((branch) => (
          <option key={branch.id} value={branch.id}>
            {branch.name}{branch.isPrimary ? ' (หลัก)' : ''}
          </option>
        ))}
      </select>
      {isLoading && <LoaderCircle className="spin" size={15} aria-hidden="true" />}
    </label>
  )
}
