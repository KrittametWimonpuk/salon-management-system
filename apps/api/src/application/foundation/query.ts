import { ValidationError } from '../../domain/foundation/domain-errors.js'
import { failure, success, type Result } from '../../domain/foundation/result.js'

export const SortDirection = {
  ASC: 'asc',
  DESC: 'desc',
} as const

export type SortDirectionValue = (typeof SortDirection)[keyof typeof SortDirection]

export interface Sort<TField extends string> {
  field: TField
  direction: SortDirectionValue
}

export interface Filter<TField extends string = string> {
  field: TField
  operator: 'eq' | 'in' | 'gte' | 'lte'
  value: string | number | boolean | readonly string[]
}

export interface PageRequest<TSortField extends string = string, TFilterField extends string = string> {
  page: number
  pageSize: number
  sort?: Sort<TSortField>
  filters?: readonly Filter<TFilterField>[]
  search?: string
}

export interface PageResult<T> {
  items: readonly T[]
  page: number
  pageSize: number
  totalItems: number
  totalPages: number
}

export function createPageRequest<TSortField extends string, TFilterField extends string>(
  input: PageRequest<TSortField, TFilterField>,
): Result<PageRequest<TSortField, TFilterField>, ValidationError> {
  if (!Number.isInteger(input.page) || input.page < 1) {
    return failure(new ValidationError('Page must be a positive integer', { field: 'page' }))
  }
  if (!Number.isInteger(input.pageSize) || input.pageSize < 1 || input.pageSize > 100) {
    return failure(new ValidationError('Page size must be between 1 and 100', { field: 'pageSize' }))
  }
  const search = input.search?.trim()
  return success({ ...input, ...(search ? { search } : {}) })
}
