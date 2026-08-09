import type { AuditContext, AuthenticatedPrincipal, BranchContext, RequestContext } from '../shared/types/context.js'

declare global {
  namespace Express {
    interface Request {
      requestContext: RequestContext
      principal?: AuthenticatedPrincipal
      branchContext?: BranchContext
    }

    interface Locals {
      auditContext?: AuditContext
      validatedQuery?: unknown
      validatedParams?: unknown
    }
  }
}

export {}
