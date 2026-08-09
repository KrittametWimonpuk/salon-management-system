# Security

## Controls Implemented

- Helmet secure headers และปิด `X-Powered-By`
- CORS allowlist พร้อม credentials; ไม่มี wildcard origin
- HttpOnly/SameSite/Secure refresh cookie และ origin validation สำหรับ auth mutations
- Access/refresh secrets แยกกัน, issuer/audience/type validation และ fixed `HS256` allowlist
- Short-lived access token และ persistent rotating refresh sessions
- Refresh-token hash at rest, family revocation และ reuse detection
- bcrypt password verification พร้อม generic error และ dummy comparison
- Global/auth rate limit, JSON body-size limit และ strict Zod schemas
- Database-backed RBAC และ Organization/Branch isolation
- Request/correlation IDs และ structured sanitized error logs
- Infrastructure audit records เก็บ actor, organization, branch, IP, user agent, outcome และ timestamp
- Prisma parameterized queries; ไม่มี raw SQL จาก request input

## Audit Storage

AuditLog schema ที่ freeze ไม่มี branch/outcome columns จึงเก็บ `branchId`, `outcome`, HTTP status, request/correlation ID, method, path และ duration ใน typed JSON metadata ส่วน User, Organization, IP, User Agent, Action และ timestamps ใช้ columns เดิม ไม่ใช่ business audit

## Threat Summary

| Threat | Control |
| --- | --- |
| Credential enumeration | Generic login error and bcrypt dummy comparison |
| Stolen refresh token | HttpOnly cookie, rotation, hash at rest, family revocation |
| Token replay | Session lookup on access request and refresh reuse detection |
| Cross-tenant IDOR | Organization from verified principal and branch lookup scoped by organization |
| Privilege escalation | Permissions loaded from active DB relations, no client role claims |
| CSRF on refresh/logout | SameSite cookie, origin allowlist and restricted cookie path |
| Error information disclosure | Stable error codes and sanitized production responses |
| Request flooding | Per-process global/auth rate limiter and bounded request body |

## Production Checklist

- [x] Separate access and refresh signing keys
- [x] Token issuer, audience, algorithm, type and expiration verification
- [x] Immediate logout and refresh-token family revocation
- [x] CORS allowlist and secure-cookie configuration
- [x] Standard response/error contract
- [x] Permission and tenant isolation tests
- [x] Dependency audit with zero known vulnerabilities at implementation time
- [x] Reference `DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` through ECS task secrets and grant the execution role least-privilege access
- [ ] Add AWS WAF or shared rate-limit storage because in-memory limits apply per Fargate task
- [ ] Configure CloudWatch alert for `audit_write_failed`, auth reuse detection and elevated 401/403 rates
- [ ] Define signing-key rotation runbook and emergency session revocation procedure
- [ ] Run DAST and external penetration testing against staging

Unchecked items require deployment/security operations and are documented risk, not deferred source-code work.
