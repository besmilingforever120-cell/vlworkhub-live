# care.vlworkhub.ca

React + Vite foundation for a large-scale care operations platform.

## Current status

- Home page is set up as a dashboard with:
	- Announcements
	- Calendar
	- Alerts
	- Current critical incidents
- Routing is enabled with `react-router-dom` and ready to scale to 100+ pages.

## Getting started

```bash
npm install
npm run dev
```

App runs at `http://localhost:5173` by default.

## Build

```bash
npm run build
```

## Project structure

- `src/router.jsx` — central route registration
- `src/App.jsx` — root app shell with route outlet
- `src/pages/HomeDashboard.jsx` — dashboard home page
