import { RefreshCw, SlidersHorizontal } from 'lucide-react'
import { useState } from 'react'
import { BranchFilter } from '../../../components/filters/BranchFilter'
import { DateRangeFilter } from '../../../components/filters/DateRangeFilter'
import { quickRange, validateDateRange, type QuickRange } from '../dashboard.dates'
import type { DashboardFilters, Granularity } from '../dashboard.types'

export function DashboardFilterBar({
  value,
  isRefreshing,
  onApply,
  onRefresh,
}: {
  value: DashboardFilters
  isRefreshing: boolean
  onApply: (filters: DashboardFilters) => void
  onRefresh: () => void
}) {
  const [draft, setDraft] = useState(value)
  const [quick, setQuick] = useState<QuickRange>('thisMonth')
  const [error, setError] = useState<string | null>(null)

  const apply = () => {
    const validation = validateDateRange(draft.dateFrom, draft.dateTo)
    setError(validation)
    if (!validation) onApply(draft)
  }

  const updateQuick = (next: QuickRange) => {
    setQuick(next)
    if (next !== 'custom') setDraft((current) => ({ ...current, ...quickRange(next, new Date(), current.timezone) }))
  }

  return (
    <section className="dashboard-filter-bar" aria-label="ตัวกรองแดชบอร์ด">
      <div className="filter-bar-title"><SlidersHorizontal aria-hidden="true" /><div><strong>ตัวกรองภาพรวม</strong><small>Timezone: {draft.timezone}</small></div></div>
      <div className="filter-grid">
        <DateRangeFilter
          dateFrom={draft.dateFrom}
          dateTo={draft.dateTo}
          quick={quick}
          onDateFrom={(dateFrom) => { setQuick('custom'); setDraft((current) => ({ ...current, dateFrom })) }}
          onDateTo={(dateTo) => { setQuick('custom'); setDraft((current) => ({ ...current, dateTo })) }}
          onQuick={updateQuick}
        />
        <BranchFilter value={draft.branchId} onChange={(branchId) => setDraft((current) => ({ ...current, branchId }))} />
        <label className="filter-field"><span>ความละเอียด</span><select value={draft.granularity} onChange={(event) => setDraft((current) => ({ ...current, granularity: event.target.value as Granularity }))}>
          <option value="daily">รายวัน</option><option value="weekly">รายสัปดาห์</option><option value="monthly">รายเดือน</option>
        </select></label>
      </div>
      {error && <p className="filter-error" role="alert">{error}</p>}
      <div className="filter-actions">
        <button className="button secondary" type="button" onClick={onRefresh} disabled={isRefreshing}>
          <RefreshCw className={isRefreshing ? 'spin' : ''} size={16} aria-hidden="true" /> รีเฟรช
        </button>
        <button className="button primary" type="button" onClick={apply}>ใช้ตัวกรอง</button>
      </div>
    </section>
  )
}
