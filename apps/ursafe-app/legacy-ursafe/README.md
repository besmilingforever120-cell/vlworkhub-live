# URSafe App

Full-stack safety and mileage tracking platform with a mobile app for employees and a web dashboard for admins.

## Project layout

- `mobile/` - Expo React Native mobile app (iOS/Android)
- `web/` - Next.js admin web dashboard and API routes
- `db/` - SQL Server schema and migrations

## Tech stack

- Mobile: Expo (React Native), TypeScript
- Web: Next.js 16, TypeScript, Tailwind CSS
- Database: SQL Server

## Requirements

- Node.js 18+ (recommend 20 LTS)
- npm
- SQL Server + ODBC Driver 18 (for local dev)

## Setup

### Install dependencies

```bash
cd mobile
npm install

cd ../web
npm install
```

### Environment variables

This repo ignores `.env` files. Copy the examples and fill in your values.

```bash
copy .env.example .env
copy web/.env.example web/.env
copy mobile/.env.example mobile/.env
```

Notes:
- Use either `DB_USER`/`DB_PASSWORD` or `DB_CONNECTION_STRING`.
- For production builds, set `EXPO_PUBLIC_API_URL` to a public HTTPS URL.

### Run the apps

Mobile:

```bash
cd mobile
npm start
```

Web:

```bash
cd web
npm run dev
```

Open `http://localhost:3000`.

## CI

GitHub Actions runs web linting and verifies mobile dependencies on each push and pull request.

## Troubleshooting

- Node 10 errors: upgrade to Node 18+.
- Expo "fetch failed" on corporate networks: configure HTTPS proxy or set `EXPO_NO_DOCTOR=1`.
- Mobile release build fails on other networks: set `EXPO_PUBLIC_API_URL` to a public HTTPS endpoint.

## License

Private and proprietary.
