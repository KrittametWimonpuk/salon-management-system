# API

## Response Contract

Successful responses use `{ "success": true, "data": ..., "meta": ... }`. Failed responses use `{ "success": false, "error": { "code": "...", "message": "...", "details": [] } }`. Prisma messages, stack traces, and secrets are never returned.

## Endpoints

| Method | Endpoint | Authentication | Permission |
| --- | --- | --- | --- |
| GET | `/health`, `/api/health` | No | - |
| POST | `/api/auth/login` | No | - |
| POST | `/api/auth/refresh` | Refresh cookie | - |
| POST | `/api/auth/logout` | Access token | - |
| GET | `/api/auth/me` | Access token | - |
| POST | `/api/context/branch` | Access token | Existing branch access |
| POST | `/api/customers` | Access token | `customer.create` |
| GET | `/api/customers` | Access token | `customer.read` |
| GET | `/api/customers/:id` | Access token | `customer.read` |
| PATCH | `/api/customers/:id` | Access token | `customer.update` |
| POST | `/api/customers/:id/archive` | Access token | `customer.archive` |
| POST | `/api/customers/:id/restore` | Access token | `customer.restore` |
| POST | `/api/customers/:id/tags` | Access token | `customer.tag.manage` |
| DELETE | `/api/customers/:id/tags/:tagId` | Access token | `customer.tag.manage` |
| POST | `/api/employees` | Access token + branch | `employee.create` |
| GET | `/api/employees` | Access token + branch | `employee.read` |
| GET | `/api/employees/:id` | Access token + branch | `employee.read` |
| PATCH | `/api/employees/:id` | Access token + branch | `employee.update` |
| POST | `/api/employees/:id/archive` | Access token + branch | `employee.archive` |
| POST | `/api/employees/:id/restore` | Access token + branch | `employee.restore` |
| POST | `/api/employees/:id/branches` | Access token + branch | `employee.branch.manage` |
| DELETE | `/api/employees/:id/branches/:branchId` | Access token + branch | `employee.branch.manage` |
| POST | `/api/employees/:id/branches/:branchId/primary` | Access token + branch | `employee.branch.manage` |
| POST | `/api/employees/:id/skills` | Access token + branch | `employee.skill.manage` |
| DELETE | `/api/employees/:id/skills/:skillId` | Access token + branch | `employee.skill.manage` |
| POST | `/api/employees/:id/working-hours` | Access token + branch | `employee.schedule.manage` |
| PATCH | `/api/employees/:id/working-hours/:workingHourId` | Access token + branch | `employee.schedule.manage` |
| DELETE | `/api/employees/:id/working-hours/:workingHourId` | Access token + branch | `employee.schedule.manage` |
| POST | `/api/employees/:id/time-off` | Access token + branch | `employee.schedule.manage` |
| POST | `/api/employees/:id/time-off/:timeOffId/cancel` | Access token + branch | `employee.schedule.manage` |
| POST | `/api/service-categories` | Access token | `service.category.manage` |
| GET | `/api/service-categories` | Access token | `service.category.manage` |
| GET | `/api/service-categories/:id` | Access token | `service.category.manage` |
| PATCH | `/api/service-categories/:id` | Access token | `service.category.manage` |
| POST | `/api/service-categories/:id/archive` | Access token | `service.category.manage` |
| POST | `/api/service-categories/:id/restore` | Access token | `service.category.manage` |
| POST | `/api/services` | Access token | `service.create` |
| GET | `/api/services` | Access token | `service.read` |
| GET | `/api/services/:id` | Access token | `service.read` |
| PATCH | `/api/services/:id` | Access token | `service.update` |
| POST | `/api/services/:id/archive` | Access token | `service.archive` |
| POST | `/api/services/:id/restore` | Access token | `service.restore` |
| POST | `/api/services/:id/branches` | Access token + branch | `service.branch.manage` |
| GET | `/api/services/:id/branches` | Access token + branch | `service.branch.manage` |
| PATCH | `/api/services/:id/branches/:branchId` | Access token + branch | `service.branch.manage` |
| DELETE | `/api/services/:id/branches/:branchId` | Access token + branch | `service.branch.manage` |
| POST | `/api/services/:id/skills` | Access token | `service.skill.manage` |
| GET | `/api/services/:id/skills` | Access token | `service.read` |
| DELETE | `/api/services/:id/skills/:skillId` | Access token | `service.skill.manage` |
| POST | `/api/skills` | Access token | `skill.create` |
| GET | `/api/skills` | Access token | `skill.read` |
| GET | `/api/skills/:id` | Access token | `skill.read` |
| PATCH | `/api/skills/:id` | Access token | `skill.update` |
| POST | `/api/skills/:id/archive` | Access token | `skill.archive` |
| POST | `/api/skills/:id/restore` | Access token | `skill.restore` |
| GET | `/api/bookings/availability` | Access token + branch | `booking.availability.read` |
| GET | `/api/bookings/calendar` | Access token + branch | `booking.read` |
| POST | `/api/bookings` | Access token + branch | `booking.create` |
| GET | `/api/bookings` | Access token + branch | `booking.read` |
| GET | `/api/bookings/:id` | Access token + branch | `booking.read` |
| PATCH | `/api/bookings/:id` | Access token + branch | `booking.update` |
| POST | `/api/bookings/:id/confirm` | Access token + branch | `booking.status.update` |
| POST | `/api/bookings/:id/check-in` | Access token + branch | `booking.status.update` |
| POST | `/api/bookings/:id/start` | Access token + branch | `booking.status.update` |
| POST | `/api/bookings/:id/complete` | Access token + branch | `booking.status.update` |
| POST | `/api/bookings/:id/no-show` | Access token + branch | `booking.status.update` |
| POST | `/api/bookings/:id/cancel` | Access token + branch | `booking.cancel` |
| POST | `/api/bookings/:id/reschedule` | Access token + branch | `booking.reschedule` |
| POST | `/api/bookings/:id/items` | Access token + branch | `booking.item.manage` |
| PATCH | `/api/bookings/:id/items/:itemId` | Access token + branch | `booking.item.manage` |
| DELETE | `/api/bookings/:id/items/:itemId` | Access token + branch | `booking.item.manage` |
| GET | `/api/bookings/:bookingId/checkout` | Access token + branch | `pos.read` |
| POST | `/api/bookings/:bookingId/checkout/validate` | Access token + branch | `payment.checkout` |
| POST | `/api/bookings/:bookingId/checkout/close-sale` | Access token + branch | `payment.close_sale` |
| POST | `/api/bookings/:bookingId/payments` | Access token + branch | `payment.create` |
| POST | `/api/bookings/:bookingId/payments/split` | Access token + branch | `payment.create` |
| GET | `/api/bookings/:bookingId/payments` | Access token + branch | `payment.read` |
| GET | `/api/bookings/:bookingId/receipt` | Access token + branch | `pos.read` |
| GET | `/api/payments` | Access token + branch | `payment.read` |
| GET | `/api/payments/:paymentId` | Access token + branch | `payment.read` |
| POST | `/api/payments/:paymentId/void` | Access token + branch | `payment.void` |
| POST | `/api/payments/:paymentId/refund` | Access token + branch | `payment.refund` |
| POST | `/api/bookings/:bookingId/commissions/preview` | Access token + branch | `commission.preview` |
| POST | `/api/bookings/:bookingId/commissions/calculate` | Access token + branch | `commission.calculate` |
| POST | `/api/bookings/:bookingId/commissions/recalculate` | Access token + branch | `commission.recalculate` |
| GET | `/api/bookings/:bookingId/commissions` | Access token + branch | `commission.read` |
| POST | `/api/employees/:employeeId/commissions/preview` | Access token + branch | `commission.preview` |
| POST | `/api/employees/:employeeId/commissions/calculate` | Access token + branch | `commission.calculate` |
| GET | `/api/employees/:employeeId/commissions` | Access token + branch | `commission.read` |
| GET | `/api/employees/:employeeId/commissions/summary` | Access token + branch | `commission.summary.read` |
| POST | `/api/commissions/preview-period` | Access token + branch | `commission.preview` |
| POST | `/api/commissions/calculate-period` | Access token + branch | `commission.calculate` |
| GET | `/api/commissions` | Access token + branch | `commission.read` |
| GET | `/api/commissions/:commissionId` | Access token + branch | `commission.read` |
| POST | `/api/commissions/:commissionId/approve` | Access token + branch | `commission.approve` |
| POST | `/api/commissions/refunds/:refundId/adjust` | Access token + branch | `commission.adjust` |
| POST | `/api/commissions/:commissionId/adjust` | Access token + branch | `commission.adjust` |
| POST | `/api/commissions/lock-period` | Access token + branch | `commission.lock` |
| GET | `/api/commissions/period-status` | Access token + branch | `commission.read` |
| GET | `/api/commissions/summary` | Access token + branch | `commission.summary.read` |

## Customer Search

`GET /api/customers` accepts `keyword`, `status`, `tag`, `page`, `pageSize`, `sort`, and `order`.

- `status`: `ACTIVE` (default), `ARCHIVED`, or `ALL`.
- `tag`: a tag UUID or case-insensitive tag-name fragment.
- `sort`: `createdAt`, `updatedAt`, `firstName`, or `lastVisitAt`.
- `order`: `asc` or `desc`.
- `pageSize`: 1 to 100, default 20.

Pagination is returned in `meta`: `page`, `pageSize`, `totalItems`, and `totalPages`.

## Employee Search

`GET /api/employees` accepts `keyword`, `status`, `branchId`, `skillId`, `page`, `pageSize`, `sort`, and `order`. The resolved branch is authoritative; a supplied `branchId` must match it. Keyword search covers display name, first name, last name, and phone. Status supports `ACTIVE`, `INACTIVE`, `TERMINATED`, `ARCHIVED`, and `ALL`.

## Service And Skill Search

`GET /api/services` accepts `keyword`, `categoryId`, `branchId`, `skillId`, `status`, `page`, `pageSize`, `sort`, and `order`. Keyword search covers service, category, branch, and skill names. A supplied `branchId` requires matching resolved branch context. Sort supports `createdAt`, `updatedAt`, `name`, `price`, and `durationMinutes`.

`GET /api/service-categories` and `GET /api/skills` accept `keyword`, `status`, `page`, `pageSize`, `sort`, and `order`. Lifecycle status is `ACTIVE`, `INACTIVE`, `ARCHIVED`, or `ALL`.

## Booking Availability, Search, And Calendar

`GET /api/bookings/availability` requires `branchId`, comma-separated `serviceIds`, and `date`. Optional `employeeId` restricts the calculation to that employee; optional `startTime` uses `HH:mm:ss`. The resolved branch must match `branchId`.

`GET /api/bookings` accepts `keyword`, `customerId`, `employeeId`, `branchId`, `status`, `dateFrom`, `dateTo`, `serviceId`, `page`, `pageSize`, `sort`, and `order`. Keyword search covers booking number, customer name/phone, employee name, and service name. Sort supports `createdAt`, `updatedAt`, `startsAt`, `bookingNumber`, and `status`. Pagination is returned in response `meta`.

`GET /api/bookings/calendar` requires `branchId` and `date`; `view` is `DAY` or `WEEK`, and `employeeId` is optional. Week view starts on Monday in the branch timezone.

Create accepts a future offset-aware `startsAt` and one to twenty ordered items. Update changes booking metadata only. Item removal is a status change, not a database delete. Cancellation and rescheduling require a non-empty reason.

## POS And Payment

Checkout and payment routes accept only `COMPLETED` bookings in the resolved branch. Payment create requires `method`, a two-decimal string `amount`, and three-letter organization `currency`; `externalReference`, `idempotencyKey`, and `notes` are optional. Split create accepts two through ten payment entries and commits them atomically.

Void requires `reason`. Refund requires `amount` and `reason`, with optional `externalReference` and `notes`. Amounts are immutable after creation; correction uses void or refund.

`GET /api/payments` accepts `keyword`, `bookingId`, `customerId`, `branchId`, `method`, `status`, `dateFrom`, `dateTo`, `page`, `pageSize`, `sort`, and `order`. Keyword covers customer name/phone, booking number, and payment external reference. Sort supports `createdAt`, `updatedAt`, `paidAt`, `amount`, and `status`.

Checkout responses include active item and discount snapshots, grouped tax, subtotal, discounts, grand total, gross paid, refunded, net paid, remaining, and aggregate payment status. Receipt data is JSON only and becomes available after close sale.

## Commission

Period bodies and queries use offset-aware `dateFrom` and `dateTo` and represent a half-open range. Booking preview/calculate may omit the period and then use the UTC month containing sale close. Employee and period operations require both boundaries. Recalculation, approval, and lock require a non-empty `reason`.

`GET /api/commissions` supports `keyword`, `bookingId`, `bookingItemId`, `employeeId`, `branchId`, `serviceId`, `status`, `dateFrom`, `dateTo`, `page`, `pageSize`, `sort`, and `order`. Status is `PENDING` or `APPROVED`; sort supports `calculatedAt`, `commissionAmount`, `employeeName`, and `serviceName`.

Refund adjustment accepts optional `reason`; otherwise the immutable PaymentRefund reason is used. The canonical route identifies `refundId`. The compatibility `/:commissionId/adjust` route accepts `{ refundId, reason? }`. There is no unlock endpoint.

## Headers And Cookies

- `Authorization: Bearer <access-token>` is required for protected endpoints.
- `X-Branch-ID: <uuid>` selects branch context. A supplied `preferredBranchId` must match the resolved branch.
- `X-Request-ID` and `X-Correlation-ID` accept `[A-Za-z0-9._:-]`, maximum 128 characters.
- `salon_refresh` is an HttpOnly cookie scoped to `/api/auth`.

## Error Codes

| Code | HTTP | Meaning |
| --- | --- | --- |
| `AUTH_001` to `AUTH_006` | 401 | Authentication/session failure |
| `PERMISSION_001` | 403 | Permission denied |
| `TENANT_001` | 400 | Invalid tenant context |
| `TENANT_002` | 400 | Branch context required |
| `TENANT_003` | 403 | Branch or tenant isolation failure |
| `VALIDATION_001` | 400 | Zod validation failure |
| `DOMAIN_001` | 409 | Business conflict, including duplicate phone |
| `DOMAIN_002` | 422 | Business rule violation |
| `DOMAIN_003` | 409 | Serializable transaction conflict |
| `DATABASE_001` | 500 | Sanitized database failure |
| `HTTP_404` | 404 | Resource or endpoint not found |
| `HTTP_429` | 429 | Rate limit exceeded |
| `INTERNAL_001` | 500 | Sanitized internal failure |

Write endpoints attach an explicit action to the existing audit middleware. Audit persistence occurs after the HTTP response finishes and is not written directly by a use case.

## Dashboard And Reports

All endpoints require an access token. An optional `X-Branch-ID` or `branchId` selects one authorized branch; without either, the result covers the branches granting the required permission, or the organization when an organization-wide grant exists.

Dashboard query parameters support `dateFrom`, `dateTo`, `period`, `timezone`, `branchId`, `employeeId`, `serviceId`, `customerId`, and `granularity`. Report bodies additionally support `keyword`, `status`, `page`, `pageSize`, `sort`, and `order`. Date ranges are half-open after timezone conversion, limited to 366 days, and default to `THIS_MONTH` in `Asia/Bangkok`.

| Method | Endpoint | Permission |
| --- | --- | --- |
| GET | `/api/dashboard/overview` | `dashboard.read` |
| GET | `/api/dashboard/business-health` | `dashboard.read` |
| GET | `/api/dashboard/trends` | `dashboard.read` |
| GET | `/api/dashboard/sales` | `sales.summary.read` |
| GET | `/api/dashboard/sales/trend` | `sales.summary.read` |
| GET | `/api/dashboard/sales/by-branch` | `sales.summary.read` |
| GET | `/api/dashboard/sales/by-service` | `sales.summary.read` |
| GET | `/api/dashboard/sales/by-employee` | `sales.summary.read` |
| GET | `/api/dashboard/bookings` | `booking.summary.read` |
| GET | `/api/dashboard/bookings/trend` | `booking.summary.read` |
| GET | `/api/dashboard/bookings/status-breakdown` | `booking.summary.read` |
| GET | `/api/dashboard/payments` | `payment.summary.read` |
| GET | `/api/dashboard/payments/method-breakdown` | `payment.summary.read` |
| GET | `/api/dashboard/payments/refunds` | `payment.summary.read` |
| GET | `/api/dashboard/payments/outstanding` | `payment.summary.read` |
| GET | `/api/dashboard/commissions` | `commission.summary.read` |
| GET | `/api/dashboard/commissions/by-employee` | `commission.summary.read` |
| GET | `/api/dashboard/commissions/by-branch` | `commission.summary.read` |
| GET | `/api/dashboard/commissions/by-period` | `commission.summary.read` |
| GET | `/api/dashboard/employees/performance` | `employee.performance.read` |
| GET | `/api/dashboard/services/performance` | `service.performance.read` |
| GET | `/api/dashboard/customers/analytics` | `customer.analytics.read` |
| GET | `/api/dashboard/branches/summary` | `branch.summary.read` |
| GET | `/api/reports` | `report.read` |

Report generation endpoints are `POST /api/reports/{sales|bookings|payments|commissions|customers|branches}`, plus `/api/reports/employees/performance` and `/api/reports/services/performance`. They require `report.read` and the corresponding domain permission. Add `/export` to those paths for export; export requires `report.export` and the corresponding domain permission.

Export bodies set `format` to `csv` or `xlsx`, with optional `columns`, `includeSummary`, and `title`. CSV is UTF-8 with BOM. Export responses are attachments and sanitize spreadsheet formulas. Financial values are integer cents. See `docs/DASHBOARD_REPORTS.md` for formulas and limits.
