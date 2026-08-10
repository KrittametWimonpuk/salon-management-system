import { FileBarChart, ShieldCheck } from 'lucide-react'
import { useCallback } from 'react'
import { reportsApi } from '../../api/reports.api'
import { EmptyState } from '../../components/data/EmptyState'
import { ErrorState } from '../../components/data/ErrorState'
import { LoadingSkeleton } from '../../components/data/LoadingSkeleton'
import { useAuth } from '../../auth/useAuth'
import { useApiResource } from '../dashboard/hooks/useApiResource'
import { REPORT_DEFINITIONS } from './report.config'
import type { AvailableReport } from './reports.types'
import { ReportTypeCard } from './components/ReportTypeCard'

export function ReportsPage() {
  const auth = useAuth()
  const loader = useCallback((signal: AbortSignal) => reportsApi.available(signal), [])
  const resource = useApiResource<readonly AvailableReport[]>(true, 'available-reports', loader)
  const available = new Map(resource.data?.map((item) => [item.type, item]) ?? [])
  const visible = REPORT_DEFINITIONS.filter((definition) => auth.hasPermission(definition.permission) && available.has(definition.type))

  return (
    <main className="reports-page">
      <header className="page-header"><div><p className="eyebrow">REPORT CENTER</p><h1>รายงานการดำเนินงาน</h1><p>เลือกชุดข้อมูลสำหรับดูตัวอย่าง วิเคราะห์ และส่งออกตามสิทธิ์ที่ได้รับ</p></div><span className="release-badge"><ShieldCheck size={16} aria-hidden="true" /> Tenant scoped</span></header>
      <section className="reports-intro"><FileBarChart aria-hidden="true" /><div><strong>ข้อมูลเดียวกับ Dashboard API</strong><p>ยอดทางการเงินมาจาก backend โดยตรง ไม่มีการคำนวณยอดซ้ำใน browser</p></div></section>
      {resource.status === 'loading' && <LoadingSkeleton rows={5} label="กำลังโหลดประเภทรายงาน" />}
      {resource.status === 'error' && <ErrorState message={resource.error?.message ?? 'ไม่สามารถโหลดรายการรายงานได้'} onRetry={resource.reload} />}
      {resource.status === 'success' && visible.length === 0 && <EmptyState message="ไม่มีประเภทรายงานที่คุณมีสิทธิ์เปิดในสาขานี้" />}
      {resource.status === 'success' && visible.length > 0 && <section className="report-type-grid" aria-label="ประเภทรายงาน">{visible.map((definition) => <ReportTypeCard key={definition.type} definition={definition} formats={available.get(definition.type)?.formats ?? []} />)}</section>}
    </main>
  )
}
