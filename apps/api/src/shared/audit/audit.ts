import type { Prisma, PrismaClient } from '@prisma/client'

export interface AuditEntry {
  organizationId: string
  userId: string | null
  branchId: string | null
  ipAddress: string | null
  userAgent: string | null
  action: string
  outcome: 'SUCCESS' | 'FAILURE'
  statusCode: number
  requestId: string
  correlationId: string
  method: string
  path: string
  durationMs: number
}

export interface AuditSink {
  record(entry: AuditEntry): Promise<void>
}

export class PrismaAuditSink implements AuditSink {
  constructor(private readonly database: PrismaClient) {}

  async record(entry: AuditEntry): Promise<void> {
    const metadata: Prisma.InputJsonObject = {
      branchId: entry.branchId,
      outcome: entry.outcome,
      statusCode: entry.statusCode,
      requestId: entry.requestId,
      correlationId: entry.correlationId,
      method: entry.method,
      path: entry.path,
      durationMs: entry.durationMs,
    }
    await this.database.auditLog.create({
      data: {
        organizationId: entry.organizationId,
        userId: entry.userId,
        action: entry.action,
        entityType: 'HTTP_REQUEST',
        metadata,
        ipAddress: entry.ipAddress,
        userAgent: entry.userAgent,
      },
    })
  }
}
