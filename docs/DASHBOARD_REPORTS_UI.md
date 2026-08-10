# Dashboard And Reports UI

## Scope

Phase 8B turns the Phase 8A admin shell into a production-oriented dashboard and report workspace. It consumes the Phase 7 read APIs only. No database schema, migration, authentication, RBAC, payment, commission, or booking calculation behavior is changed.

## UI Architecture

```text
apps/web/src/
|-- api/
|   |-- dashboard.api.ts       typed dashboard reads
|   |-- reports.api.ts         report preview and binary export
|   `-- lookups.api.ts         read-only filter options
|-- components/
|   |-- data/                  table, bars, skeleton, empty and error states
|   `-- filters/               date range and accessible-branch controls
`-- features/
    |-- dashboard/             overview, permission-isolated widgets and filters
    `-- reports/               catalog, detail preview, pagination and export
```

Components never call `fetch`. JSON and binary requests pass through the Phase 8A shared client, preserving memory-only access tokens, HttpOnly refresh cookies, one-time `401` refresh/retry, `credentials: include`, request IDs, and branch headers.

Dashboard widgets use abortable resources. A filter change aborts the stale request and each authorized section loads independently. A section-level `403` remains local to that widget so one permission race does not invalidate the entire authenticated workspace.

## Routes

| Route | Route permission |
| --- | --- |
| `/admin/dashboard` | `dashboard.read` |
| `/admin/reports` | `report.read` |
| `/admin/reports/sales` | `report.read` + `sales.summary.read` |
| `/admin/reports/bookings` | `report.read` + `booking.summary.read` |
| `/admin/reports/payments` | `report.read` + `payment.summary.read` |
| `/admin/reports/commissions` | `report.read` + `commission.summary.read` |
| `/admin/reports/employees` | `report.read` + `employee.performance.read` |
| `/admin/reports/services` | `report.read` + `service.performance.read` |
| `/admin/reports/customers` | `report.read` + `customer.analytics.read` |
| `/admin/reports/branches` | `report.read` + `branch.summary.read` |

Export actions additionally require `report.export`. Unauthorized dashboard sections and report cards are not requested or rendered. Backend policy remains authoritative.

## Dashboard

The overview shows booking counts, gross/net sales, paid/refunded/outstanding amounts, commission total, average ticket, and the top service, employee, and branch. Authorized sections cover:

- sales summary and trend
- booking summary and status breakdown
- payment summary and method breakdown
- commission summary and employee ranking
- employee performance
- service performance
- customer analytics
- branch comparison

Financial values remain integer cents until presentation and use `Intl.NumberFormat` for THB. Basis points are formatted as percentages. CSS metric bars provide lightweight comparisons without adding a chart dependency or duplicating business calculations.

## Filters

The default range is the current month in `Asia/Bangkok`. Quick ranges support today, yesterday, the last seven days, this month, last month, and custom dates. Client validation prevents inverted ranges and ranges over 366 inclusive days before the request reaches Zod.

The branch selector is built only from `BranchProvider.accessibleBranches`. Selecting one branch sends its authorized ID; selecting all accessible branches omits both the query branch and `X-Branch-ID`, allowing the backend to derive the permitted branch set from grants. Reports support daily, weekly, or monthly granularity plus optional employee, service, customer, keyword, and status filters when the user has the corresponding read permission.

## Report Flow

1. `GET /api/reports` returns available report types and formats.
2. The catalog intersects those types with current frontend permissions.
3. The user applies filters and explicitly generates one report page.
4. The typed API posts to the report-specific endpoint.
5. The table renders configured columns, row count, applied filters, summary metrics, and server pagination.
6. Page changes request only the selected page; other report types are not loaded.

Success with zero rows uses a polite empty state. Network/server errors use the safe API error mapper and expose retry. Loading skeletons and export status use semantic status/live-region behavior.

## Export Flow

CSV and XLSX use authenticated POST requests to the report-specific `/export` endpoint. Tokens never appear in URLs and `window.open` is not used. The client:

1. receives the blob in memory;
2. reads `Content-Disposition` when present;
3. removes control characters, path separators, traversal sequences, and unsafe filename characters;
4. falls back to `salon-{type}-{from}-{to}.{format}`;
5. creates a temporary object URL, triggers download, then revokes it.

The active export button is disabled while the request runs. JSON error envelopes returned from an export endpoint use the same safe error mapper as normal requests.

## Accessibility

- Native labels are associated with all date, branch, granularity, lookup, search, status, and page-size inputs.
- Buttons have visible text or explicit accessible names.
- Tables include captions, `scope="col"` headers, keyboard-focusable horizontal scroll containers, and visible focus styles.
- Loading, empty, export completion, and error states use status or alert semantics.
- Color is accompanied by labels, values, or icons and is never the only status signal.
- Reduced-motion preferences disable skeleton/spinner animation duration.

Automated markup tests do not replace a real NVDA/keyboard audit. Browser QA results must state the tested environment explicitly.

## Responsive Behavior

Desktop uses dense metric grids and two-column analytical widgets. Tablet reduces filters and cards to two or three tracks. Mobile stacks filters and widgets, keeps export buttons touch-usable, converts KPI rows to vertical lists, and places wide report tables in a keyboard-focusable horizontal scroller.

## Browser QA

Local browser QA on 2026-08-10 used the isolated PostgreSQL test database and real authenticated API responses. Desktop coverage at 1280 x 720 verified login, dashboard loading, date-range changes, branch-context changes, report preview, CSV export, XLSX export, and logout. Chromium coverage at 390 x 844 verified that:

- the dashboard and report document widths remain 390 CSS pixels with no page-level horizontal overflow;
- dashboard and report filters stack within the viewport;
- the report table scrolls inside its 356-pixel container instead of widening the page;
- both export actions remain within the viewport; and
- logout clears the session and redirects to `/login`.

Automated tests cover branch-header propagation and permission isolation. A full screen-reader session and deployed HTTPS cookie matrix remain outside this local QA pass and are documented separately.

## Verification

```powershell
cd apps/web
npm run typecheck
npm run lint
npm test
npm run build
npm audit

cd ../api
$env:DATABASE_URL="postgresql://<user>:<password>@localhost:5434/salon_test?schema=public"
$env:TEST_DATABASE_URL=$env:DATABASE_URL
npm run typecheck
npm run lint
npm run build
npx prisma validate
npx prisma migrate status
npm test
```

Use placeholders in documentation and never commit environment values.

## Known Limitations

- CSS bars and tabular trends are used instead of a chart dependency. They cover the current operational comparison needs without increasing the bundle.
- Read-only employee, service, and customer filter lookups request the first 100 active records. Server-search lookup controls are tracked for large tenants in `TECH_DEBT.md`.
- Export remains synchronous and memory-backed within Phase 7 server limits; background jobs remain TD-040.
- Automated deployed HTTPS cookie E2E remains TD-045.

## Phase 8C Readiness

Phase 8C can reuse the shared data states, date/branch filters, table semantics, API error mapping, permission gates, and responsive layout. Customer, employee, and service CRUD must remain separate feature modules and preserve the same API/provider boundaries.
