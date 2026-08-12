import { Building2 } from 'lucide-react'
import { useBranch } from '../../branch/useBranch'

export function BranchFilter({ value, onChange }: { value: string | null; onChange: (branchId: string | null) => void }) {
  const branch = useBranch()
  return (
    <label className="filter-field"><span>ขอบเขตสาขา</span><span className="select-with-icon"><Building2 size={15} aria-hidden="true" />
      <select value={value ?? 'all'} onChange={(event) => onChange(event.target.value === 'all' ? null : event.target.value)}>
        {branch.accessibleBranches.length > 1 && <option value="all">ทุกสาขาที่เข้าถึงได้</option>}
        {branch.accessibleBranches.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
    </span></label>
  )
}
