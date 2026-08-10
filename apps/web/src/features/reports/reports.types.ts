import type { DashboardFilters } from '../dashboard/dashboard.types'

export const REPORT_TYPES = [
  'sales',
  'bookings',
  'payments',
  'commissions',
  'employee-performance',
  'service-performance',
  'customers',
  'branches',
] as const

export type ReportType = typeof REPORT_TYPES[number]
export type ExportFormat = 'csv' | 'xlsx'
export type ReportCell = string | number | null
export type ReportRow = Readonly<Record<string, ReportCell>>

export interface AvailableReport {
  type: ReportType
  formats: readonly ['json', 'csv', 'xlsx']
}

export interface ReportRequest extends DashboardFilters {
  page: number
  pageSize: number
  sort: string
  order: 'asc' | 'desc'
  keyword?: string
  status?: string
}

export interface GeneratedReport {
  reportType: ReportType
  timezone: string
  dateFrom: string
  dateTo: string
  summary: ReportRow
  rows: readonly ReportRow[]
  page: number
  pageSize: number
  totalItems: number
  totalPages: number
}

export interface ReportDefinition {
  type: ReportType
  title: string
  description: string
  permission: string
  path: string
}

export interface ReportColumn {
  key: string
  label: string
  format?: 'money' | 'number' | 'date' | 'percent' | 'status'
}

export interface ExportArtifact {
  blob: Blob
  filename: string
  contentType: string
}
