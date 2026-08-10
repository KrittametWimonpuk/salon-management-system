import { apiRequest } from './client'

export interface LookupOption {
  id: string
  label: string
}

interface EmployeeListItem { id: string; displayName: string; employeeCode: string }
interface ServiceListItem { id: string; name: string; code: string }
interface CustomerListItem { id: string; firstName: string; lastName: string | null; customerNumber: string }

export const lookupsApi = {
  async employees(branchId: string, signal?: AbortSignal): Promise<readonly LookupOption[]> {
    const query = new URLSearchParams({ branchId, pageSize: '100', sort: 'displayName', order: 'asc' })
    const rows = await apiRequest<readonly EmployeeListItem[]>(`/employees?${query}`, {
      notifyForbidden: false,
      ...(signal ? { signal } : {}),
    })
    return rows.map((row) => ({ id: row.id, label: `${row.displayName} (${row.employeeCode})` }))
  },
  async services(branchId: string, signal?: AbortSignal): Promise<readonly LookupOption[]> {
    const query = new URLSearchParams({ branchId, pageSize: '100', sort: 'name', order: 'asc' })
    const rows = await apiRequest<readonly ServiceListItem[]>(`/services?${query}`, {
      notifyForbidden: false,
      ...(signal ? { signal } : {}),
    })
    return rows.map((row) => ({ id: row.id, label: `${row.name} (${row.code})` }))
  },
  async customers(signal?: AbortSignal): Promise<readonly LookupOption[]> {
    const query = new URLSearchParams({ pageSize: '100', sort: 'firstName', order: 'asc' })
    const rows = await apiRequest<readonly CustomerListItem[]>(`/customers?${query}`, {
      notifyForbidden: false,
      ...(signal ? { signal } : {}),
    })
    return rows.map((row) => ({
      id: row.id,
      label: `${row.firstName}${row.lastName ? ` ${row.lastName}` : ''} (${row.customerNumber})`,
    }))
  },
}
