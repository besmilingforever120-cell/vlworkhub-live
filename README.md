# VLWorkHub

Production-oriented monorepo for the VLWorkHub platform.

- `apps/main-platform` central login, dashboard, and app launcher
- `apps/care-app` care management replacement
- `apps/hr-app` HR portal replacement
- `apps/ursafe-app` safety and mileage replacement
- `services/api` Express + MySQL API
- `services/auth` shared JWT and cookie auth helpers
- `packages/ui` shared design system and CRUD scaffolding
- `infra` Docker, Nginx, and MySQL bootstrap

## Local development

1. Copy `.env.example` to `.env` and adjust values.
2. Install dependencies with `npm install`.
3. Start apps with workspace scripts or `docker compose up --build`.
