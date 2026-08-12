import { useCallback, useState } from 'react'
import { reportsApi } from '../../../api/reports.api'
import type { ExportFormat, ReportRequest, ReportType } from '../reports.types'

export function useReportExport(type: ReportType) {
  const [activeFormat, setActiveFormat] = useState<ExportFormat | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const exportReport = useCallback(async (format: ExportFormat, request: ReportRequest) => {
    setActiveFormat(format)
    setMessage(null)
    setError(null)
    try {
      const artifact = await reportsApi.export(type, format, request)
      const url = URL.createObjectURL(artifact.blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = artifact.filename
      anchor.rel = 'noopener'
      anchor.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 0)
      setMessage(`เตรียมไฟล์ ${format.toUpperCase()} เรียบร้อยแล้ว`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'ส่งออกรายงานไม่สำเร็จ')
    } finally {
      setActiveFormat(null)
    }
  }, [type])

  return { activeFormat, message, error, exportReport }
}
