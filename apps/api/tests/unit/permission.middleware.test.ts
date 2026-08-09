import type { NextFunction, Request, Response } from 'express'
import { describe, expect, it, vi } from 'vitest'
import { requirePermission, requirePermissionAcrossAccessibleBranches } from '../../src/modules/rbac/permission.middleware.js'
import { ErrorCode } from '../../src/shared/errors/error-codes.js'

describe('requirePermission', () => {
  it('allows a permission loaded into the current branch context', () => {
    const request = { branchContext: { permissions: ['booking.read'] } } as unknown as Request
    const next = vi.fn() as NextFunction
    requirePermission('booking.read')(request, {} as Response, next)
    expect(next).toHaveBeenCalledWith()
  })

  it('returns a standardized forbidden error when permission is absent', () => {
    const request = { branchContext: { permissions: [] } } as unknown as Request
    const next = vi.fn() as NextFunction
    requirePermission('booking.update')(request, {} as Response, next)
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: ErrorCode.PERMISSION_DENIED }))
  })
})

describe('requirePermissionAcrossAccessibleBranches', () => {
  it('uses all grants when a report request has no explicit branch', () => {
    const request = { header: () => undefined, branchContext: { permissions: [] }, principal: { grants: [
      { branchId: 'branch-1', permissions: [] }, { branchId: 'branch-2', permissions: ['report.read'] },
    ] } } as unknown as Request
    const next = vi.fn() as NextFunction
    requirePermissionAcrossAccessibleBranches('report.read')(request, {} as Response, next)
    expect(next).toHaveBeenCalledWith()
  })

  it('uses only resolved branch permissions when a branch header is explicit', () => {
    const request = { header: () => 'branch-1', branchContext: { permissions: [] }, principal: { grants: [
      { branchId: 'branch-2', permissions: ['report.read'] },
    ] } } as unknown as Request
    const next = vi.fn() as NextFunction
    requirePermissionAcrossAccessibleBranches('report.read')(request, {} as Response, next)
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: ErrorCode.PERMISSION_DENIED }))
  })
})
