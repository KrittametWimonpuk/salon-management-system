import type { Response } from 'express'
import type { ErrorDetail } from '../errors/app-error.js'
import type { ErrorCodeValue } from '../errors/error-codes.js'

export function sendSuccess<T>(
  response: Response,
  data: T,
  options: { statusCode?: number; meta?: Record<string, unknown> } = {},
): Response {
  return response.status(options.statusCode ?? 200).json({
    success: true,
    data,
    meta: options.meta ?? {},
  })
}

export function sendError(
  response: Response,
  options: { statusCode: number; code: ErrorCodeValue; message: string; details?: ErrorDetail[] },
): Response {
  return response.status(options.statusCode).json({
    success: false,
    error: {
      code: options.code,
      message: options.message,
      details: options.details ?? [],
    },
  })
}
