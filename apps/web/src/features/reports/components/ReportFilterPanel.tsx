import { Play, Search } from 'lucide-react'
import { BranchFilter } from '../../../components/filters/BranchFilter'
import { DateRangeFilter } from '../../../components/filters/DateRangeFilter'
import type { LookupOption } from '../../../api/lookups.api'
import { quickRange, validateDateRange, type QuickRange } from '../../dashboard/dashboard.dates'
import type { Granularity } from '../../dashboard/dashboard.types'
import type { ReportRequest, ReportType } from '../reports.types'

const statusOptions: Partial<Record<ReportType, readonly string[]>> = {
  sales: ['PENDING', 'PAID', 'PARTIAL', 'REFUNDED', 'VOID'],
  bookings: ['PENDING', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW'],
  payments: ['PENDING', 'PAID', 'PARTIAL', 'REFUNDED', 'VOID'],
  commissions: ['OPEN', 'APPROVED', 'LOCKED'],
}

function LookupSelect({ label, value, options, onChange }: { label: string; value: string | undefined; options: readonly LookupOption[]; onChange: (value: string | undefined) => void }) {
  return <label className="filter-field"><span>{label}</span><select value={value ?? ''} onChange={(event) => onChange(event.target.value || undefined)}><option value="">ทั้งหมด</option>{options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
}

function updateOptional(value: ReportRequest, key: 'employeeId' | 'serviceId' | 'customerId' | 'keyword' | 'status', next: string | undefined): ReportRequest {
  const updated = { ...value, page: 1 }
  if (next) updated[key] = next
  else delete updated[key]
  return updated
}

function updateBranch(value: ReportRequest, branchId: string | null): ReportRequest {
  const updated = { ...value, branchId, page: 1 }
  delete updated.employeeId
  delete updated.serviceId
  return updated
}

export function ReportFilterPanel({
  type,
  value,
  quick,
  employees,
  services,
  customers,
  loading,
  onChange,
  onQuick,
  onGenerate,
}: {
  type: ReportType
  value: ReportRequest
  quick: QuickRange
  employees: readonly LookupOption[]
  services: readonly LookupOption[]
  customers: readonly LookupOption[]
  loading: boolean
  onChange: (value: ReportRequest) => void
  onQuick: (value: QuickRange) => void
  onGenerate: (error: string | null) => void
}) {
  const updateQuick = (next: QuickRange) => {
    onQuick(next)
    if (next !== 'custom') onChange({ ...value, ...quickRange(next, new Date(), value.timezone), page: 1 })
  }
  return (
    <section className="report-filter-panel" aria-label="ตัวกรองรายงาน">
      <div className="filter-grid report-filter-grid">
        <DateRangeFilter dateFrom={value.dateFrom} dateTo={value.dateTo} quick={quick} onQuick={updateQuick}
          onDateFrom={(dateFrom) => { onQuick('custom'); onChange({ ...value, dateFrom, page: 1 }) }}
          onDateTo={(dateTo) => { onQuick('custom'); onChange({ ...value, dateTo, page: 1 }) }} />
        <BranchFilter value={value.branchId} onChange={(branchId) => onChange(updateBranch(value, branchId))} />
        <label className="filter-field"><span>ความละเอียด</span><select value={value.granularity} onChange={(event) => onChange({ ...value, granularity: event.target.value as Granularity, page: 1 })}><option value="daily">รายวัน</option><option value="weekly">รายสัปดาห์</option><option value="monthly">รายเดือน</option></select></label>
        {employees.length > 0 && <LookupSelect label="พนักงาน" value={value.employeeId} options={employees} onChange={(employeeId) => onChange(updateOptional(value, 'employeeId', employeeId))} />}
        {services.length > 0 && <LookupSelect label="บริการ" value={value.serviceId} options={services} onChange={(serviceId) => onChange(updateOptional(value, 'serviceId', serviceId))} />}
        {customers.length > 0 && <LookupSelect label="ลูกค้า" value={value.customerId} options={customers} onChange={(customerId) => onChange(updateOptional(value, 'customerId', customerId))} />}
        <label className="filter-field"><span>ค้นหาในรายงาน</span><span className="select-with-icon"><Search size={15} aria-hidden="true" /><input value={value.keyword ?? ''} maxLength={160} placeholder="ชื่อ เลขที่ หรือสถานะ" onChange={(event) => onChange(updateOptional(value, 'keyword', event.target.value || undefined))} /></span></label>
        {statusOptions[type] && <label className="filter-field"><span>สถานะ</span><select value={value.status ?? ''} onChange={(event) => onChange(updateOptional(value, 'status', event.target.value || undefined))}><option value="">ทั้งหมด</option>{statusOptions[type]?.map((status) => <option key={status} value={status}>{status.replaceAll('_', ' ')}</option>)}</select></label>}
        <label className="filter-field"><span>จำนวนต่อหน้า</span><select value={value.pageSize} onChange={(event) => onChange({ ...value, pageSize: Number(event.target.value), page: 1 })}><option value="20">20</option><option value="50">50</option><option value="100">100</option></select></label>
      </div>
      <div className="report-filter-footer"><p>Timezone: <strong>{value.timezone}</strong> · สูงสุด 366 วัน</p><button className="button primary" type="button" disabled={loading} onClick={() => onGenerate(validateDateRange(value.dateFrom, value.dateTo))}><Play size={16} aria-hidden="true" /> {loading ? 'กำลังสร้างรายงาน' : 'สร้างรายงาน'}</button></div>
    </section>
  )
}
