import { Download, LoaderCircle } from 'lucide-react'
import type { ExportFormat } from '../reports.types'

export function ReportExportButton({ format, loading, disabled, onClick }: { format: ExportFormat; loading: boolean; disabled: boolean; onClick: () => void }) {
  return (
    <button className="button secondary export-button" type="button" onClick={onClick} disabled={disabled || loading}>
      {loading ? <LoaderCircle className="spin" size={16} aria-hidden="true" /> : <Download size={16} aria-hidden="true" />}
      {loading ? `กำลังส่งออก ${format.toUpperCase()}` : `ส่งออก ${format.toUpperCase()}`}
    </button>
  )
}
