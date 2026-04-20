# URSafe Mobile App

This app is an isolated mobile data-producer layer for URSafe.

## Framework
- Expo + React Native

## Required environment
Set this before running on device/emulator:

- `EXPO_PUBLIC_API_URL=http://<your-ip>:8080`

## Run

```bash
npm install
npm run start -w @vlworkhub/ursafe-mobile-app
```

## Core flows implemented
- Login via `/auth/login`
- Auth check via `/auth/me`
- Active session heartbeats via `/ursafe/active-sessions` (with `/ursafe/sessions` fallback)
- Shift auto-create on login via `/ursafe/shifts`
- Trip start/stop with route capture and upload via `/ursafe/trips`
- Check-ins via `/ursafe/check-ins` (with `/ursafe/checkins` fallback)
- SOS emergency via `/ursafe/emergencies`

## Architecture
- Mobile produces data (sessions/trips/check-ins/emergencies)
- Existing web app consumes and visualizes that data
