import { Prisma } from '@prisma/client'
import type { ErrorRequestHandler, RequestHandler } from 'express'
import { AppError } from '../errors/app-error.js'
import { ErrorCode } from '../errors/error-codes.js'
import { sendError } from '../http/response.js'

export const notFoundHandler: RequestHandler = (_request, _response, next) => {
  next(new AppError({
    code: ErrorCode.NOT_FOUND,
    statusCode: 404,
    message: 'Endpoint not found',
  }))
}

export const globalErrorHandler: ErrorRequestHandler = (error: unknown, request, response, _next) => {
  void _next
  if (error instanceof AppError) {
    sendError(response, {
      statusCode: error.statusCode,
      code: error.code,
      message: error.expose ? error.message : 'Internal server error',
      details: error.expose ? error.details : [],
    })
    return
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    console.error(JSON.stringify({
      level: 'error',
      event: 'database_error',
      requestId: request.requestContext?.requestId,
      prismaCode: error.code,
    }))
    sendError(response, {
      statusCode: 500,
      code: ErrorCode.DATABASE_ERROR,
      message: 'Database operation failed',
    })
    return
  }

  console.error(JSON.stringify({
    level: 'error',
    event: 'unhandled_error',
    requestId: request.requestContext?.requestId,
    message: error instanceof Error ? error.message : 'Unknown error',
    stack: error instanceof Error && process.env.NODE_ENV !== 'production' ? error.stack : undefined,
  }))
  sendError(response, {
    statusCode: 500,
    code: ErrorCode.INTERNAL_ERROR,
    message: 'Internal server error',
  })
}
