# Frontend Auth Cookie Smoke Check

## Purpose

This checklist verifies browser-enforced refresh-cookie behavior that jsdom and HTTP integration tests cannot fully prove. Run it against the same-origin local stack for functional checks and an HTTPS deployment for the `Secure` policy check.

Use a dedicated non-production test account. Never paste access tokens, refresh cookies, passwords, or database URLs into screenshots, issues, or logs.

## Automated Coverage

- API HTTP integration verifies login, `HttpOnly`, `SameSite=Strict`, `/api/auth` path scope, rotation, reuse rejection, logout clearing, and access-session revocation.
- Frontend tests verify memory-only access tokens, empty local/session storage, one refresh attempt, one original-request retry, logout state clearing, and protected-route redirects.
- PostgreSQL integration verifies that organization and branch context remain scoped to the authenticated tenant.

## Local Browser Checklist

1. Start the API and web application with the documented local test environment.
2. Open a private browser window and sign in with a dedicated test account.
3. Confirm the browser navigates to `/admin/dashboard` and shows the expected organization and branch names.
4. In DevTools Application/Storage, confirm `salon_refresh` is marked `HttpOnly`, `SameSite=Strict`, and scoped to `/api/auth`.
5. In the page console, run `document.cookie` and confirm it does not contain `salon_refresh`.
6. Inspect Local Storage and Session Storage and confirm neither contains an access token, refresh token, JWT, or authorization value. Only theme and branch preferences are allowed.
7. In Network, force or wait for one protected request to return `401`. Confirm there is one `/api/auth/refresh` request and at most one retry of the original request.
8. Sign out. Confirm the application returns to `/login`, protected routes redirect to `/login`, and the refresh cookie is removed or expired.
9. Confirm the browser console contains no token or cookie values.

## HTTPS Deployment Checklist

Repeat the local checklist on the deployed HTTPS origin and additionally confirm:

- `salon_refresh` has the `Secure` attribute.
- Login, refresh, and logout requests use the expected trusted origin and send cookies with `credentials: include`.
- Requests from an origin outside the configured allowlist are rejected.
- No authentication cookie is sent outside `/api/auth`.

Record only pass/fail results, environment name, application version, browser version, and timestamp. Do not record credential or token values.
