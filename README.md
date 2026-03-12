# VLWorkHub

Production-oriented monorepo for the VLWorkHub platform.

- `apps/main-platform` central login, dashboard, and app launcher
- `apps/care-app` care management replacement
- `apps/hr-app` HR portal replacement
- `apps/ursafe-app` safety and mileage replacement
- `services/api` Express + PostgreSQL API
- `services/auth` shared JWT and cookie auth helpers
- `packages/ui` shared design system and CRUD scaffolding
- `infra` Docker, Nginx, and PostgreSQL bootstrap

## Local development

1. Copy `.env.example` to `.env` and adjust values.
2. Install dependencies with `npm install`.
3. Start apps with `npm run dev` or `docker compose up --build`.

## Ubuntu deployment

1. Copy the project to the Ubuntu server.
2. Copy `.env.example` to `.env` and set `DATABASE_URL=postgres://postgres:postgres@postgres:5432/vlworkhub`.
3. Start the stack with `docker compose up -d --build`.
4. Verify containers with `docker compose ps`.
5. Verify PostgreSQL and API:
   `docker compose logs postgres`
   `curl http://localhost:8080/health`
6. Test authentication after startup:
   `curl -i -X POST http://localhost:8080/auth/login -H "Content-Type: application/json" -d '{"email":"admin@vlworkhub.ca","password":"Password123!"}'`

Expected checks:
- `postgres` should report healthy and initialize `infra/pgsql/schema.sql`
- `api` should log a successful database connection check on startup
- `GET /health` should return `{"status":"ok"}`
- `/auth/login` should return a session cookie when the stack is up
