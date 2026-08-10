import { ArrowLeft, Clock3, Filter, TableProperties } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { lookupsApi, type LookupOption } from '../../api/lookups.api'
import { reportsApi } from '../../api/reports.api'
import { useAuth } from '../../auth/useAuth'
import { useBranch } from '../../branch/useBranch'
import { DataTable } from '../../components/data/DataTable'
import { EmptyState } from '../../components/data/EmptyState'
import { ErrorState } from '../../components/data/ErrorState'
import { LoadingSkeleton } from '../../components/data/LoadingSkeleton'
import { formatMoney, formatNumber, formatPercentFromBps } from '../../utils/format'
import { defaultDashboardFilters, type QuickRange } from '../dashboard/dashboard.dates'
import { useApiResource } from '../dashboard/hooks/useApiResource'
import { ReportExportButton } from './components/ReportExportButton'
import { ReportFilterPanel } from './components/ReportFilterPanel'
import { ReportPagination } from './components/ReportPagination'
import { REPORT_BY_PATH, REPORT_COLUMNS } from './report.config'
import { useReportExport } from './hooks/useReportExport'
import type { GeneratedReport, ReportCell, ReportRequest } from './reports.types'

function initialRequest(branchId: string | null): ReportRequest {
  return { ...defaultDashboardFilters(branchId), page: 1, pageSize: 20, sort: 'date', order: 'desc' }
}

function summaryValue(key: string, value: ReportCell): string {
  if (value === null) return '-'
  if (/amount|sales|total|spend|ticket|price|revenue|commission/i.test(key)) return formatMoney(Number(value))
  if (/ratebps/i.test(key)) return formatPercentFromBps(Number(value))
  return typeof value === 'number' ? formatNumber(value) : String(value)
}

export function ReportDetailPage() {
  const { reportPath = '' } = useParams()
  const definition = REPORT_BY_PATH[reportPath]
  const auth = useAuth()
  const branch = useBranch()
  const [draft, setDraft] = useState<ReportRequest>(() => initialRequest(branch.currentBranch?.id ?? null))
  const [applied, setApplied] = useState<ReportRequest | null>(null)
  const [quick, setQuick] = useState<QuickRange>('thisMonth')
  const [validationError, setValidationError] = useState<string | null>(null)
  const [employees, setEmployees] = useState<readonly LookupOption[]>([])
  const [services, setServices] = useState<readonly LookupOption[]>([])
  const [customers, setCustomers] = useState<readonly LookupOption[]>([])
  const canReadEmployees = auth.hasPermission('employee.read')
  const canReadServices = auth.hasPermission('service.read')
  const canReadCustomers = auth.hasPermission('customer.read')
  const type = definition?.type ?? 'sales'
  const loader = useCallback((signal: AbortSignal) => {
    if (!applied) return Promise.reject(new Error('Report has not been generated'))
    return reportsApi.generate(type, applied, signal)
  }, [applied, type])
  const resourceKey = useMemo(() => applied ? `${type}:${JSON.stringify(applied)}` : `${type}:idle`, [applied, type])
  const report = useApiResource<GeneratedReport>(Boolean(applied), resourceKey, loader)
  const exportState = useReportExport(type)

  useEffect(() => {
    const currentBranchId = branch.currentBranch?.id
    if (!currentBranchId) return
    const controller = new AbortController()
    let active = true
    const apply = (setter: (options: readonly LookupOption[]) => void) => (options: readonly LookupOption[]) => {
      if (active) setter(options)
    }
    const clear = (setter: (options: readonly LookupOption[]) => void) => () => {
      if (active && !controller.signal.aborted) setter([])
    }
    if (canReadEmployees) void lookupsApi.employees(currentBranchId, controller.signal).then(apply(setEmployees)).catch(clear(setEmployees))
    if (canReadServices) void lookupsApi.services(currentBranchId, controller.signal).then(apply(setServices)).catch(clear(setServices))
    if (canReadCustomers) void lookupsApi.customers(controller.signal).then(apply(setCustomers)).catch(clear(setCustomers))
    return () => {
      active = false
      controller.abort()
    }
  }, [branch.currentBranch?.id, canReadCustomers, canReadEmployees, canReadServices])

  if (!definition) return <Navigate to="/404" replace />
  if (!auth.hasPermission(definition.permission)) return <Navigate to="/403" replace />

  const generate = (error: string | null) => {
    setValidationError(error)
    if (!error) setApplied({ ...draft, page: 1 })
  }
  const goToPage = (page: number) => {
    setApplied((current) => current ? { ...current, page } : current)
  }

  return (
    <main className="report-detail-page">
      <Link className="back-link" to="/admin/reports"><ArrowLeft size={16} aria-hidden="true" /> กลับไปหน้ารายงาน</Link>
      <header className="page-header"><div><p className="eyebrow">REPORT PREVIEW</p><h1>{definition.title}</h1><p>{definition.description}</p></div><span className="timezone-badge"><Clock3 size={15} aria-hidden="true" /> {draft.timezone}</span></header>
      <ReportFilterPanel type={definition.type} value={draft} quick={quick} employees={employees} services={services} customers={customers} loading={report.status === 'loading'} onChange={setDraft} onQuick={setQuick} onGenerate={generate} />
      {validationError && <p className="filter-error standalone" role="alert">{validationError}</p>}

      {!applied && <section className="report-awaiting"><Filter aria-hidden="true" /><h2>กำหนดตัวกรองแล้วสร้างรายงาน</h2><p>ระบบจะโหลดเฉพาะรายงานนี้และจำกัดผลลัพธ์ตามหน้า</p></section>}
      {report.status === 'loading' && <LoadingSkeleton rows={7} label="กำลังสร้างรายงาน" />}
      {report.status === 'error' && <ErrorState message={report.error?.message ?? 'ไม่สามารถสร้างรายงานได้'} onRetry={report.reload} />}
      {report.status === 'success' && report.data && <>
        <section className="applied-filters" aria-label="ตัวกรองที่ใช้"><TableProperties aria-hidden="true" /><p><strong>{report.data.totalItems.toLocaleString('th-TH')} รายการ</strong><span>{applied?.dateFrom} ถึง {applied?.dateTo} · {report.data.timezone} · {applied?.granularity}</span></p></section>
        <section className="report-summary-grid" aria-label="สรุปรายงาน">{Object.entries(report.data.summary).slice(0, 8).map(([key, value]) => <div key={key}><span>{key.replaceAll(/([A-Z])/g, ' $1')}</span><strong>{summaryValue(key, value)}</strong></div>)}</section>
        <section className="report-results" aria-labelledby="report-results-title">
          <header><div><h2 id="report-results-title">ตัวอย่างข้อมูล</h2><p>แสดงสูงสุด {report.data.pageSize} รายการต่อหน้า</p></div>
            <div className="report-export-actions" aria-live="polite">
              {auth.hasPermission('report.export') && applied && <><ReportExportButton format="csv" loading={exportState.activeFormat === 'csv'} disabled={Boolean(exportState.activeFormat)} onClick={() => { void exportState.exportReport('csv', applied) }} /><ReportExportButton format="xlsx" loading={exportState.activeFormat === 'xlsx'} disabled={Boolean(exportState.activeFormat)} onClick={() => { void exportState.exportReport('xlsx', applied) }} /></>}
            </div>
          </header>
          {exportState.message && <p className="export-status" role="status">{exportState.message}</p>}
          {exportState.error && <p className="filter-error" role="alert">{exportState.error}</p>}
          {report.data.rows.length === 0 ? <EmptyState /> : <DataTable caption={definition.title} columns={REPORT_COLUMNS[definition.type]} rows={report.data.rows} timezone={report.data.timezone} />}
          <ReportPagination page={report.data.page} totalPages={report.data.totalPages} totalItems={report.data.totalItems} onPage={goToPage} />
        </section>
      </>}
    </main>
  )
}
