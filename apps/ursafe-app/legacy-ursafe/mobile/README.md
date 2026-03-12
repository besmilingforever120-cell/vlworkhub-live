# Mobile App

Employee-facing mobile application for mileage tracking.

## Features
- GPS-based trip tracking
- Offline support
- Trip categorization
- Real-time location recording
- Authentication

## Setup

1. Install dependencies:
```bash
npm install
```

2. Update the API URL in `lib/api.ts` to your machine IP:
```ts
export const API_URL = 'http://<your-ip>:3000';
```

3. Start the development server:
```bash
npm start
```

## Project Structure
- `contexts/` - React contexts for authentication and trip management
- `screens/` - Application screens
- `lib/` - API configuration and background tasks

## Requirements
- Node.js 18+
- Expo Go app on mobile device
- API server running on the same network
