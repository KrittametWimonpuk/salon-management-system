# Technical Debt Register

## Purpose

เอกสารนี้รวมข้อจำกัดและหนี้ทางเทคนิคที่ยังคงอยู่หลัง Phase 1-6 เพื่อใช้วางแผน hardening, operations และ Phase ถัดไป โดยไม่ถือ feature ที่ตั้งใจอยู่นอก scope เป็น defect โดยอัตโนมัติ

ปรับปรุงล่าสุด: 2026-08-09

## Severity

| Level | Meaning |
| --- | --- |
| P0 | ต้องแก้ก่อนเปิด production เพราะกระทบ security หรือ financial integrity โดยตรง |
| P1 | ควรแก้ก่อน scale-out หรือก่อนมีหลาย writer/หลายสาขาใช้งานจริง |
| P2 | มี mitigation ใช้งานได้ แต่เพิ่ม operational cost หรือจำกัด workflow |
| P3 | ข้อจำกัดที่ยอมรับได้ในระยะสั้นและแก้เมื่อ business ต้องใช้ |

## Debt Register

| ID | Phase | Severity | Debt / Limitation | Current Mitigation | Exit Criteria |
| --- | --- | --- | --- | --- | --- |
| TD-001 | 1-6 | P0 | ไม่มี permission seed/onboarding สำหรับ permission keys ของ Customer, Employee, Service, Booking, Payment และ Commission | Provision `Permission`, `RolePermission` และ `UserRole` ด้วย operational procedure | มี versioned, idempotent permission bootstrap และ integration test สำหรับ role grants ทุก module |
| TD-002 | 2 | P0 | Rate limit อยู่ใน memory ของแต่ละ Fargate task จึงไม่เป็น global limit เมื่อ scale หลาย task | จำกัด ALB exposure และตั้ง per-task limits | ใช้ AWS WAF rate-based rule หรือ shared rate-limit store พร้อม load test |
| TD-003 | 2 | P0 | ยังไม่มี DAST และ external penetration test บน staging | Secure defaults, strict validation, tenant/policy tests และ dependency audit | DAST/penetration report ไม่มี unresolved critical/high findings |
| TD-004 | 2 | P1 | ยังไม่มี signing-key rotation runbook และ emergency session revocation procedure | แยก access/refresh secrets และรองรับ token-family revocation | มี runbook ที่ทดสอบแล้ว, rotation drill และ incident owner |
| TD-005 | 2 | P1 | ยังไม่มี CloudWatch alerts สำหรับ `audit_write_failed`, refresh-token reuse และอัตรา 401/403 ที่ผิดปกติ | Structured logs ถูกส่งออกได้ | มี metric filters, dashboards, alarms และ incident routing |
| TD-006 | 2-6 | P1 | Audit middleware เขียนหลัง HTTP response และเป็น best-effort จึงไม่ atomic กับ business transaction | Failure ถูก log เป็น `audit_write_failed`; financial domains มี immutable ledgers ของตนเอง | ใช้ transactional audit/outbox สำหรับ critical writes หรือกำหนด durable audit sink พร้อม reconciliation |
| TD-007 | 1/3B.1 | P1 | ความไม่ซ้ำของ Customer phone ภายใน Organization ไม่มี partial unique index; direct SQL หรือ writer อื่น bypass application lock ได้ | Serializable transaction และ advisory lock ใน Customer use cases | เพิ่ม normalized phone column/index แบบ additive และ partial unique constraint พร้อม backfill/reconciliation |
| TD-008 | 1/3B.3 | P1 | Service/Category/Skill name uniqueness บางส่วนบังคับใน application ไม่ใช่ database | Serializable writes และ scoped advisory locks | เพิ่ม normalized scoped partial unique indexes โดยไม่ทำลายข้อมูลเดิม |
| TD-009 | 1/3B.3 | P2 | `ServiceSkill` ไม่มี soft-delete fields จึงต้อง hard-delete join row ซึ่งเป็นข้อยกเว้นของ policy | จำกัดการลบเฉพาะ associative row; Service และ Skill ไม่ถูกลบ | เพิ่ม lifecycle fields แบบ additive และเปลี่ยน removal เป็น soft delete |
| TD-010 | 1/3B.3 | P2 | Tax defaults อยู่ที่ Service เท่านั้น; BranchService override ภาษีไม่ได้ | BookingItem snapshot ค่า tax จาก Service | เพิ่ม branch tax override เฉพาะเมื่อ business/legal requirement ต้องใช้ พร้อม snapshot precedence test |
| TD-011 | 1-4 | P2 | ไม่มี Setting administration/bootstrap; `booking.slot_interval_minutes` ต้อง provision เอง | Availability ปฏิเสธการทำงานเมื่อ setting ไม่ถูกต้อง | มี typed Setting API, schema registry, defaults และ deployment bootstrap |
| TD-012 | 3A | P1 | Domain events เป็น in-process และหายได้เมื่อ process restart; ไม่มี retry, broker หรือ transactional outbox | ใช้เฉพาะ side effect ภายใน process และห้ามผูก external delivery | เพิ่ม transactional outbox, idempotent consumers, retry/backoff และ dead-letter handling |
| TD-013 | 3A-6 | P2 | TransactionManager แปลง serialization conflict แต่ไม่มี bounded server-side retry | Client retry command ทั้งก้อน; writes สำคัญมี locks/idempotency บางส่วน | เพิ่ม bounded retry เฉพาะ idempotent use-case boundaries พร้อม metrics และ jitter |
| TD-014 | 3A/4/6 | P2 | ยังไม่มี reusable organization/branch timezone calendar service | Booking มี timezone conversion ของตนเอง; Commission รับ UTC instants | มี shared timezone service สำหรับ day/week/month boundaries และ DST tests |
| TD-015 | 3B.2/4 | P3 | Working hours และ Booking ไม่รองรับ overnight shifts/bookings | Validation บังคับ end หลัง start ในวันเดียวกัน | รองรับช่วงข้ามวันด้วย normalized intervals และ conflict tests เมื่อ business อนุมัติ |
| TD-016 | 3B.2 | P2 | EmployeeTimeOff อนุญาตช่วงเวลาทับกัน | Availability ถือทุกช่วงเป็น unavailable จึงยังปลอดภัยต่อ booking | เพิ่ม overlap policy/constraint หรือ merge workflow ตาม business decision |
| TD-017 | 4 | P1 | BookingItem ไม่มี buffer snapshot ทำให้ service buffer ไม่กิน capacity และการเปลี่ยน buffer ภายหลังตรวจย้อนหลังไม่ได้ | Schedule ใช้ duration snapshot และไม่คำนวณ buffer | เพิ่ม buffer-before/after snapshots แบบ additive และรวมใน conflict range |
| TD-018 | 4 | P2 | BookingItem snapshot เก็บ service name แต่ไม่เก็บ employee display name | ประวัติแสดงชื่อ Employee ปัจจุบัน | เพิ่ม immutable employee-name snapshot สำหรับเอกสารและรายงานย้อนหลัง |
| TD-019 | 4 | P1 | ไม่มี PostgreSQL exclusion constraint สำหรับ employee/customer schedule overlap | Serializable transaction และ advisory locks ป้องกันใน application path | ประเมิน GiST exclusion constraint หรือ dedicated capacity table พร้อม migration/backfill |
| TD-020 | 4 | P3 | ยังไม่มี waitlist, recurring booking และ chair/resource allocation | จำกัด domain เป็นบริการต่อพนักงาน | แยก capability/resource model เมื่อมี approved requirements; ไม่เพิ่มล่วงหน้า |
| TD-021 | 5 | P1 | Refund API ไม่มี dedicated idempotency key | ตรวจ refundable balance, immutable refund history และ optional external reference | เพิ่ม scoped refund idempotency key พร้อม unique constraint และ replay contract |
| TD-022 | 5 | P2 | Split payment ไม่มี batch-level idempotency; retry ต้องใช้ per-line keys ใหม่/คงเดิมอย่างถูกต้อง | แต่ละ Payment รองรับ namespaced idempotency key | เพิ่ม split batch command record และ replay response แบบ atomic |
| TD-023 | 5 | P2 | Receipt ใช้ Booking number และไม่มี receipt sequence/fiscal identity | Booking number immutable และ receipt เป็น JSON | เพิ่ม branch-scoped gap policy/sequence และ fiscal integration ตามข้อกฎหมาย |
| TD-024 | 5 | P3 | ไม่รองรับ overpayment/change, gateway lifecycle, chargeback, cash drawer หรือ shift close | รับเฉพาะยอดไม่เกิน remaining; offline payments เป็น `PAID` ทันที | แยก POS session/gateway adapters เมื่อเลือก provider และ workflow แล้ว |
| TD-025 | 6 | P0 | Commission immutability บังคับผ่าน repository contract และ restrictive FK แต่ยังไม่มี DB trigger/privilege ที่ห้าม direct UPDATE/DELETE | Production code ไม่มี update/delete methods สำหรับ History, Adjustment, Approval | เพิ่ม append-only DB role/privileges หรือ immutable triggers พร้อม migration tests |
| TD-026 | 6 | P1 | CommissionPeriod ป้องกันเฉพาะช่วงที่เหมือนกันทุกค่า แต่ยังไม่ป้องกันช่วงเวลาทับกันใน branch เดียว | ใช้ period ranges ที่กำหนดโดย operator และ advisory period lock | เพิ่ม overlap validation ภายใน transaction และ PostgreSQL exclusion constraint หากเหมาะสม |
| TD-027 | 6 | P1 | Refund commission adjustment เป็น explicit command ไม่ได้เชื่อม PaymentRefund แบบ durable อัตโนมัติ จึงอาจค้างถ้า operator ไม่เรียก endpoint | Health/reconciliation สามารถเทียบ refund กับ adjustment; unique refund/item ป้องกันซ้ำ | ใช้ outbox/event consumer หรือ scheduled reconciliation ที่สร้าง adjustment อย่าง idempotent |
| TD-028 | 6 | P1 | Period calculation ทำหลาย booking ใน SERIALIZABLE transaction เดียว อาจถือ locks นานเมื่อข้อมูลโต | เหมาะกับปริมาณปัจจุบันและป้องกัน duplicate ได้แน่นอน | เพิ่ม idempotent calculation batch, chunking/checkpoint และ background worker พร้อม progress/retry |
| TD-029 | 6 | P2 | Commission summaries aggregate ledger rows ใน application memory | Query ถูก tenant/branch/date scoped และมี indexes | ใช้ SQL aggregation/read model/materialized view หลังวัด query volume ของ Phase 7 |
| TD-030 | 6 | P2 | Commission period รับ UTC boundaries และ booking default ใช้ UTC calendar month ไม่ใช่ branch-local month | Client แปลง local period เป็น offset-aware UTC | ใช้ shared timezone service และ persist canonical local-period identity |
| TD-031 | 6 | P2 | TIER รองรับ flat tier เท่านั้น | Rule documentation และ tests ระบุ semantics ชัดเจน | เพิ่ม explicit tier strategy enum และ progressive calculation เมื่อ approved |
| TD-032 | 6 | P2 | CommissionRule ยังไม่มี administration API แม้มี permission keys สำหรับ rule read/manage | Provision rules ผ่าน controlled database operation | สร้าง rule lifecycle module, validation API, effective-date conflict checks และ audit |
| TD-033 | 6 | P2 | `CommissionHistory.status/approvedAt/paidAt` เป็น legacy fields แต่ approval source of truth อยู่ใน CommissionApproval ledger | Reads ใช้ approval relation และยังไม่ทำ Payroll | กำหนด deprecation/compatibility contract; ห้าม downstream อ่าน legacy status โดยตรง |
| TD-034 | 6 | P3 | FIXED commission ถูกลดตามสัดส่วนเมื่อ refund และไม่มี unlock period | เป็น approved business policy; carry-forward adjustment รักษา locked history | เปลี่ยนเฉพาะเมื่อมี policy versioning และ migration-free rule semantics ที่ชัดเจน |
| TD-035 | 1-6 | P1 | README ยังเป็นข้อความ Webapp Starter/Asset CRUD และคำสั่งบางส่วนไม่ตรง Salon modules ปัจจุบัน | เอกสาร domain แยกรายไฟล์ใน `docs/` | เขียน README ใหม่สำหรับ Salon architecture, setup, migrations, tests และ deployment |
| TD-036 | 1-6 | P1 | Repository เพิ่ง init และยังไม่มี initial commit, remote, branch protection หรือ CI required checks | Local Git เริ่มติดตามได้แล้ว; secrets/build outputs ถูก ignore | สร้าง intentional initial commit, เชื่อม GitHub, เปิด branch protection และ CI สำหรับ validate/test/lint/build |

## Accepted Scope Constraints

รายการต่อไปนี้เป็นข้อจำกัดที่อนุมัติแล้ว ไม่ถือเป็น debt ที่ต้องแก้ทันที:

- Phase 6 ไม่มี Payroll, salary payout, accounting journal, dashboard, reports UI, export หรือ notification
- CommissionPeriod ไม่มี Unlock API; correction หลัง lock ใช้ carry-forward adjustment
- Payment รับเงินเฉพาะ Booking `COMPLETED` และไม่รับ `CHECKED_IN`/`IN_PROGRESS`
- Commission ใช้ flat tier และ proportional refund จนกว่าจะมี policy version ใหม่
- ไม่มี frontend business modules ใน Phase 1-6 ตาม backend-first delivery plan

## Recommended Order

### Before Production

1. TD-001 permission bootstrap
2. TD-002, TD-003, TD-004, TD-005 security operations
3. TD-021 refund idempotency
4. TD-025 database-enforced commission immutability
5. TD-026 non-overlapping financial periods
6. TD-035, TD-036 repository documentation, remote and CI governance

### Before Multi-Task Scale-Out

1. TD-006 durable audit
2. TD-012 transactional outbox
3. TD-013 bounded concurrency retry
4. TD-027 automatic refund reconciliation
5. TD-028 commission batch processing

### Phase 7 Reporting Preparation

1. TD-014 and TD-030 timezone period service
2. TD-029 commission read model/aggregation benchmarks
3. TD-018 employee historical snapshot
4. TD-033 legacy commission status contract

### Phase 7 Dashboard And Reports

| ID | Phase | Severity | Debt / Limitation | Current Mitigation | Exit Criteria |
| --- | --- | --- | --- | --- | --- |
| TD-037 | 7 | P1 | Dashboard/report permission keys have no versioned seed or onboarding workflow | Operators provision permissions and role grants before enabling endpoints; Policy Engine and middleware fail closed | Idempotent, versioned RBAC bootstrap with integration coverage for every Phase 7 permission |
| TD-038 | 7 | P2 | Outstanding balance is current ledger state for sales closed in range, not a historical as-of value | API/docs label the metric as current state and financial ledgers remain immutable | Add an approved accounting snapshot/read model with reconciliation tests |
| TD-039 | 7 | P2 | WorkingHour is not an immutable historical schedule snapshot, so retroactive edits may change utilization | Effective dates, holidays, and approved time off are applied consistently | Introduce effective immutable schedule revisions and backfill verified snapshots |
| TD-040 | 7 | P2 | CSV/XLSX export is synchronous and memory-backed | Maximum 10,000 bounded facts, 366-day range, and fail-closed truncation | Background job, streaming/object storage, cancellation, expiry, and load tests |
| TD-041 | 7 | P2 | Dashboard aggregates query transactional tables without a cache, materialized view, or read replica | Fixed projection queries run in parallel with strict row/range limits and no N+1 | Production p95 benchmarks justify and validate an indexed read model or replica |
| TD-042 | 7 | P3 | Dashboard reads are not persisted to AuditLog to avoid high-volume audit growth | Request logs and in-process `DashboardViewed` events retain operational observability; generated reports/exports are audited | Define retention/cost policy and add sampled or dedicated analytics telemetry if compliance requires it |
| TD-043 | 7 | P2 | ExcelJS 4.4.0 depends on `uuid` 8.x, which npm audit flags for the buffer form of UUID v3/v5/v6 | The report path uses ExcelJS workbook generation and its UUID v4 call only; CSV remains available; no untrusted UUID buffer is supplied | Upgrade when ExcelJS releases a compatible fixed dependency, or replace the exporter after compatibility and regression testing |

### Phase 8A Frontend Auth Foundation

| ID | Phase | Severity | Debt / Limitation | Current Mitigation | Exit Criteria |
| --- | --- | --- | --- | --- | --- |
| TD-045 | 8A | P2 | Cross-origin refresh-cookie behavior has API/browser-manual coverage but no automated deployed-browser E2E smoke test | API tests verify flags, rotation, reuse rejection, and clearing; frontend tests verify storage and retry bounds; `FRONTEND_E2E_COOKIE_CHECK.md` defines local and HTTPS checks | Automate the HTTPS checklist in deployment CI across supported browsers without exposing credentials or token values |

Resolved in the Phase 8A release polish: TD-044. The additive tenant context now returns and renders the authoritative organization display name with PostgreSQL tenant-isolation coverage.

### Phase 8B Dashboard And Reports UI

| ID | Phase | Severity | Debt / Limitation | Current Mitigation | Exit Criteria |
| --- | --- | --- | --- | --- | --- |
| TD-046 | 8B | P2 | Employee, service, and customer report-filter lookups return at most the first 100 active records because existing list envelopes are unwrapped without pagination metadata | Filters remain optional, branch/tenant scoped, permission gated, and never accept an inaccessible generated ID | Add a shared paged-envelope client and accessible debounced server-search combobox with large-tenant browser/integration coverage |

Phase 8B intentionally uses CSS comparison bars and tables instead of a chart dependency. This is a product choice rather than debt while the current views remain readable and accessible; reassess with measured visualization requirements and bundle budgets.

## Governance

- ทุก debt ที่แก้ต้องมี migration/rollback strategy เมื่อแตะข้อมูลสำคัญ
- Financial และ tenant-isolation debt ต้องมี PostgreSQL integration tests
- ปิดรายการได้เมื่อ Exit Criteria ผ่านและเอกสาร module/API/database ถูกอัปเดตแล้ว
- ทบทวน register ก่อนเริ่มแต่ละ phase และหลัง production incident ทุกครั้ง
