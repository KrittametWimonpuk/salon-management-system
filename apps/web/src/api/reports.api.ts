import { apiBinaryRequest, apiRequest } from './client'
import type {
  AvailableReport,
  ExportArtifact,
  ExportFormat,
  GeneratedReport,
  ReportRequest,
  ReportType,
} from '../features/reports/reports.types'

const reportPaths: Record<ReportType, string> = {
  sales: '/reports/sales',
  bookings: '/reports/bookings',
  payments: '/reports/payments',
  commissions: '/reports/commissions',
  'employee-performance': '/reports/employees/performance',
  'service-performance': '/reports/services/performance',
  customers: '/reports/customers',
  branches: '/reports/branches',
}

function requestOptions(input: ReportRequest, signal?: AbortSignal) {
  return {
    method: 'POST',
    body: JSON.stringify(input),
    branch: input.branchId !== null,
    notifyForbidden: false,
    ...(signal ? { signal } : {}),
  }
}

function safeFilename(disposition: string | null, fallback: string): string {
  const encoded = disposition?.match(/filename\*=UTF-8''([^;]+)/i)?.[1]
  const basic = disposition?.match(/filename="?([^";]+)"?/i)?.[1]
  let candidate = fallback
  try {
    candidate = encoded ? decodeURIComponent(encoded) : basic ?? fallback
  } catch {
    candidate = fallback
  }
  const withoutControls = [...candidate].map((character) => character.charCodeAt(0) < 32 ? '-' : character).join('')
  const cleaned = withoutControls
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\.\.+/g, '.')
    .replace(/^\.+/, '')
    .trim()
  return cleaned && cleaned !== '.' ? cleaned.slice(0, 160) : fallback
}

export const reportsApi = {
  available: (signal?: AbortSignal) => apiRequest<readonly AvailableReport[]>('/reports', {
    notifyForbidden: false,
    ...(signal ? { signal } : {}),
  }),
  generate: (type: ReportType, input: ReportRequest, signal?: AbortSignal) =>
    apiRequest<GeneratedReport>(reportPaths[type], requestOptions(input, signal)),
  async export(type: ReportType, format: ExportFormat, input: ReportRequest): Promise<ExportArtifact> {
    const response = await apiBinaryRequest(`${reportPaths[type]}/export`, {
      ...requestOptions(input),
      body: JSON.stringify({ ...input, format }),
    })
    const fallback = `salon-${type}-${input.dateFrom}-${input.dateTo}.${format}`
    return {
      blob: response.blob,
      filename: safeFilename(response.contentDisposition, fallback),
      contentType: response.contentType,
    }
  },
}

export { safeFilename }
