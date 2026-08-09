import type { RequestHandler } from 'express'
import type { ZodType } from 'zod'
import { AppError } from '../errors/app-error.js'
import { ErrorCode } from '../errors/error-codes.js'

export function validateBody(schema: ZodType<unknown>): RequestHandler {
  return (request, _response, next) => {
    const result = schema.safeParse(request.body)
    if (!result.success) {
      next(validationError(result.error.issues))
      return
    }
    request.body = result.data
    next()
  }
}

export function validateQuery(schema: ZodType<unknown>): RequestHandler {
  return (request, response, next) => {
    const result = schema.safeParse(request.query)
    if (!result.success) {
      next(validationError(result.error.issues))
      return
    }
    response.locals.validatedQuery = result.data
    next()
  }
}

export function validateParams(schema: ZodType<unknown>): RequestHandler {
  return (request, response, next) => {
    const result = schema.safeParse(request.params)
    if (!result.success) {
      next(validationError(result.error.issues))
      return
    }
    response.locals.validatedParams = result.data
    next()
  }
}

function validationError(issues: readonly { path: PropertyKey[]; message: string }[]): AppError {
  return new AppError({
    code: ErrorCode.VALIDATION_FAILED,
    statusCode: 400,
    message: 'Request validation failed',
    details: issues.map((issue) => ({ field: issue.path.join('.'), message: issue.message })),
  })
}
