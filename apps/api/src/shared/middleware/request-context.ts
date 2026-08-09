import { randomUUID } from 'node:crypto'
import type { RequestHandler } from 'express'

const safeRequestId = /^[A-Za-z0-9._:-]{1,128}$/

function headerId(value: string | undefined): string {
  return value && safeRequestId.test(value) ? value : randomUUID()
}

export const requestContextMiddleware: RequestHandler = (request, response, next) => {
  const requestId = headerId(request.header('x-request-id'))
  const correlationId = headerId(request.header('x-correlation-id'))

  request.requestContext = { requestId, correlationId, startedAt: Date.now() }
  response.setHeader('x-request-id', requestId)
  response.setHeader('x-correlation-id', correlationId)
  next()
}
