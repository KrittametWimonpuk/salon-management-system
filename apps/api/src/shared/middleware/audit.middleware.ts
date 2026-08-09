import type { RequestHandler } from 'express'
import type { AuditSink } from '../audit/audit.js'

export function auditMiddleware(sink: AuditSink): RequestHandler {
  return (request, response, next) => {
    response.on('finish', () => {
      const context = response.locals.auditContext
      const organizationId = context?.organizationId ?? request.principal?.organizationId
      if (!organizationId) return

      void sink.record({
        organizationId,
        userId: context?.userId ?? request.principal?.userId ?? null,
        branchId: context?.branchId ?? request.branchContext?.branchId ?? null,
        ipAddress: request.ip || null,
        userAgent: request.header('user-agent') ?? null,
        action: context?.action ?? `${request.method} ${request.path}`,
        outcome: response.statusCode < 400 ? 'SUCCESS' : 'FAILURE',
        statusCode: response.statusCode,
        requestId: request.requestContext.requestId,
        correlationId: request.requestContext.correlationId,
        method: request.method,
        path: request.path,
        durationMs: Date.now() - request.requestContext.startedAt,
      }).catch((error: unknown) => {
        console.error(JSON.stringify({
          level: 'error',
          event: 'audit_write_failed',
          requestId: request.requestContext.requestId,
          message: error instanceof Error ? error.message : 'Unknown audit error',
        }))
      })
    })
    next()
  }
}
