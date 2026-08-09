import type { NextFunction, Request, Response } from 'express'
import { describe, expect, it, vi } from 'vitest'
import { requirePermission } from '../../src/modules/rbac/permission.middleware.js'
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
