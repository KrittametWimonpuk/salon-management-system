import type { QuickRange } from '../../features/dashboard/dashboard.dates'

export function DateRangeFilter({
  dateFrom,
  dateTo,
  quick,
  onDateFrom,
  onDateTo,
  onQuick,
}: {
  dateFrom: string
  dateTo: string
  quick: QuickRange
  onDateFrom: (value: string) => void
  onDateTo: (value: string) => void
  onQuick: (value: QuickRange) => void
}) {
  return (
    <>
      <label className="filter-field"><span>ช่วงด่วน</span><select value={quick} onChange={(event) => onQuick(event.target.value as QuickRange)}>
        <option value="today">วันนี้</option><option value="yesterday">เมื่อวาน</option><option value="last7">7 วันล่าสุด</option>
        <option value="thisMonth">เดือนนี้</option><option value="lastMonth">เดือนที่แล้ว</option><option value="custom">กำหนดเอง</option>
      </select></label>
      <label className="filter-field"><span>วันที่เริ่มต้น</span><input type="date" value={dateFrom} onChange={(event) => onDateFrom(event.target.value)} /></label>
      <label className="filter-field"><span>วันที่สิ้นสุด</span><input type="date" value={dateTo} onChange={(event) => onDateTo(event.target.value)} /></label>
    </>
  )
}
