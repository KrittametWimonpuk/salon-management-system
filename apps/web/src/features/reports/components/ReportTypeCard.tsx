import { ArrowRight, FileChartColumn } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { ReportDefinition } from '../reports.types'

export function ReportTypeCard({ definition, formats }: { definition: ReportDefinition; formats: readonly string[] }) {
  return (
    <article className="report-type-card">
      <span className="report-type-icon"><FileChartColumn aria-hidden="true" /></span>
      <div><h2>{definition.title}</h2><p>{definition.description}</p></div>
      <div className="report-card-meta"><span>{formats.join(' · ').toUpperCase()}</span><code>{definition.permission}</code></div>
      <Link className="button secondary" to={`/admin/reports/${definition.path}`}>เปิดรายงาน <ArrowRight size={16} aria-hidden="true" /></Link>
    </article>
  )
}
