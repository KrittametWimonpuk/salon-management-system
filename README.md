# Salon Management System

Production-oriented multi-organization and multi-branch salon management platform.

## Current Capability

- JWT authentication with rotating HttpOnly refresh cookies
- Database-backed RBAC, tenant isolation, and branch context
- Customer, employee, service, skill, booking, POS, payment, and commission domains
- Dashboard and reporting APIs with CSV/XLSX export
- React admin foundation with protected routes and permission navigation

Backend baseline: `v0.7.0`. Frontend Phase 8A is developed on `feature/phase-8a-frontend-auth-foundation`.

## Stack

| Layer | Technology |
| --- | --- |
| Web | React 18, Vite, TypeScript, React Router |
| API | Express, TypeScript, Zod |
| Data | PostgreSQL, Prisma |
| Auth | JWT, bcrypt, rotating refresh sessions |
| Infrastructure | Docker Compose, AWS ECS/Fargate, ALB, RDS |

## Repository

```text
apps/
|-- api/   Express application and Prisma schema
`-- web/   React administration application
docs/      architecture, API, security, and module documentation
deploy/    AWS deployment scripts
```

## Local Development

Create a local `.env` from `.env.example` and replace placeholder secrets. Never commit the resulting `.env` file.

Start PostgreSQL and the API:

```powershell
docker compose up -d db
cd apps/api
npm install
npx prisma migrate deploy
npm run dev
```

Start the web application in another terminal:

```powershell
cd apps/web
npm install
npm run dev
```

The web application is available at `http://localhost:5173`. Vite proxies `/api` to `http://localhost:4000`.

## Quality Checks

API:

```powershell
cd apps/api
npm run typecheck
npm run lint
npm run build
npx prisma validate
npm test
```

Web:

```powershell
cd apps/web
npm run typecheck
npm run lint
npm run build
npm test
npm audit
```

## Frontend Environment

`apps/web/.env.example` defines `VITE_API_BASE_URL`. The default `/api` value works with the Vite proxy, Nginx, and ALB path routing. Access tokens remain in memory and refresh tokens remain in HttpOnly cookies.

## Documentation

- [API](docs/API.md)
- [Database](docs/DATABASE.md)
- [RBAC](docs/RBAC.md)
- [Security](docs/SECURITY.md)
- [Frontend Auth Foundation](docs/FRONTEND_AUTH_FOUNDATION.md)
- [Frontend Auth Cookie Smoke Check](docs/FRONTEND_E2E_COOKIE_CHECK.md)
- [Technical Debt](docs/TECH_DEBT.md)

## License

MIT
