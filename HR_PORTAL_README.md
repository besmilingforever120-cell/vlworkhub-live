# VLWorkHub HR Portal README

## Overview

The HR Portal is the HR application inside the VLWorkHub monorepo. It runs as a separate Next.js app and uses the shared VLWorkHub authentication/session system plus a shared Express/PostgreSQL API.

Primary goals of the HR Portal:

- Provide HR-facing workflows for announcements, onboarding, tasks, training, surveys, documents, and administration
- Enforce role-based visibility for employees, managers, and HR admins
- Reuse the shared VLWorkHub user directory and application access model
- Store operational data in PostgreSQL and local upload storage used by the API

Core app location:

- [apps/hr-app](C:/vlworkhub/apps/hr-app)

Core API location:

- [services/api](C:/vlworkhub/services/api)

## High-Level Architecture

### Frontend

The HR Portal frontend is a Next.js app using the App Router.

Key shell/layout files:

- [app/layout.tsx](C:/vlworkhub/apps/hr-app/app/layout.tsx)
- [components/hr-portal-shell.tsx](C:/vlworkhub/apps/hr-app/components/hr-portal-shell.tsx)
- [components/hr-portal-header.tsx](C:/vlworkhub/apps/hr-app/components/hr-portal-header.tsx)
- [middleware.ts](C:/vlworkhub/apps/hr-app/middleware.ts)

The shell provides:

- Left sidebar navigation
- Header with breadcrumb, notifications, session user, and date
- Admin-only nav visibility for the Admin page

### Backend

The shared API is an Express app.

Key backend files:

- [src/server.ts](C:/vlworkhub/services/api/src/server.ts)
- [src/routes/hr-routes.ts](C:/vlworkhub/services/api/src/routes/hr-routes.ts)
- [src/lib/hr-permissions.ts](C:/vlworkhub/services/api/src/lib/hr-permissions.ts)
- [src/controllers/hr-documents-controller.ts](C:/vlworkhub/services/api/src/controllers/hr-documents-controller.ts)

The backend provides:

- Shared auth/session endpoints
- HR resource routes
- HR permission filtering
- Local upload serving from `/uploads`
- Document and onboarding file handling
- The onboarding expiry task scheduler startup hook

## How Authentication and Access Work

### 1. Login and session

The portal does not manage a separate HR login. It uses the shared VLWorkHub session cookie/JWT.

Relevant files:

- [services/api/src/routes/auth-routes.ts](C:/vlworkhub/services/api/src/routes/auth-routes.ts)
- [services/api/src/middleware/auth.ts](C:/vlworkhub/services/api/src/middleware/auth.ts)

Important behavior:

- `POST /auth/login` creates the shared session
- `GET /auth/me` returns the authenticated user
- The HR app frontend always expects the API to be reachable
- If the API is down, the HR app shows API connectivity errors

### 2. App access

The HR portal middleware checks whether the signed-in user has access to the HR app.

Relevant file:

- [apps/hr-app/middleware.ts](C:/vlworkhub/apps/hr-app/middleware.ts)

Important behavior:

- If there is no valid session, the user is redirected to the shared login page
- If the user does not have HR app access, they are redirected to `/access-denied`
- Middleware checks `/api/apps/my-access` to verify the `HR` app is enabled

### 3. Platform admin vs HR role

There are two different concepts:

- Platform role
  - Used to determine access to the Admin page and some system-wide actions
  - Typical values seen in the current code: `SUPER_ADMIN`, `ADMIN`, `USER`
- HR role
  - Used for HR data visibility and actions
  - Values: `admin`, `manager`, `employee`

Frontend role hook:

- [apps/hr-app/lib/use-hr-role.ts](C:/vlworkhub/apps/hr-app/lib/use-hr-role.ts)

Backend HR permission logic:

- [services/api/src/lib/hr-permissions.ts](C:/vlworkhub/services/api/src/lib/hr-permissions.ts)

## HR Permission Model

### Employee

Employees can generally:

- See their own HR-visible items
- Start/complete only their assigned tasks
- See their own training assignments
- See their own survey assignments
- See their own onboarding files
- View/sign documents only when assigned and permitted by document rules

Employees generally cannot:

- Create definitions
- See peer data
- Access admin pages

### Manager

Managers can generally:

- See their own items
- See direct-report items where the page/resource supports manager visibility
- Review department/team-facing records depending on the resource
- Review non-sensitive team documents

Managers generally cannot:

- Create admin-only definitions unless the page explicitly allows HR admin creation
- Act on another user’s task as if they were assigned
- Open sensitive documents unless directly assigned

### HR Admin

HR admins can generally:

- Create and manage HR-facing definitions
- View broad HR data sets
- Access admin-only operational views
- Manage documents, announcements, assignments, onboarding records, and archives

### Platform Admin

Platform `ADMIN` or `SUPER_ADMIN` also drives visibility of the Admin nav/page in the shell.

Relevant shell logic:

- [components/hr-portal-shell.tsx](C:/vlworkhub/apps/hr-app/components/hr-portal-shell.tsx)

## Page-by-Page Summary

### Dashboard

Route:

- `/dashboard`

Files:

- [app/dashboard/page.tsx](C:/vlworkhub/apps/hr-app/app/dashboard/page.tsx)
- [components/hr-dashboard.tsx](C:/vlworkhub/apps/hr-app/components/hr-dashboard.tsx)

Purpose:

- Entry point summary page for HR users
- Shows current counts and actionable items across modules

What it does:

- Loads current user, platform users, HR assignments, announcements, tasks, training, surveys, and documents
- Applies visibility rules before showing tasks/training/surveys/documents
- Shows summary cards for:
  - Documents
  - Training
  - Tasks
  - Surveys
- Shows filtered content sections for visible work items

Important notes:

- Dashboard task visibility is intended to match task-page visibility logic
- Completed or hidden items are reduced from what the user sees depending on role and assignment

### Announcements

Route:

- `/announcements`

Files:

- [app/announcements/page.tsx](C:/vlworkhub/apps/hr-app/app/announcements/page.tsx)
- [components/announcements-workspace.tsx](C:/vlworkhub/apps/hr-app/components/announcements-workspace.tsx)

Purpose:

- Publish and read HR/company announcements

What it does:

- Shows role badge
- Shows read-only notice for non-managers of content creation
- Lets HR admins create/edit/delete announcements
- Filters by audience, dates, and priority

Announcement behavior:

- Audience can be `All Staff` or department-based
- Published items are the main user-facing output
- Expired items are marked

### Onboarding

Route:

- `/onboarding`

Files:

- [app/onboarding/page.tsx](C:/vlworkhub/apps/hr-app/app/onboarding/page.tsx)
- [components/onboarding-workspace.tsx](C:/vlworkhub/apps/hr-app/components/onboarding-workspace.tsx)

Purpose:

- Consolidated employee onboarding workspace
- Brought forward from the legacy SPFx onboarding implementation

What it does:

- Displays onboarding training/module cards
- Preserves iframe-based onboarding content
- Tracks progress client-side for module completion
- Provides onboarding-day document upload
- Supports multi-file upload
- Stores uploaded onboarding files into the user’s onboarding folder
- Shows uploaded files and their expiry dates

Key onboarding features:

- Multiple onboarding modules
- Required document checklist
- Multi-file upload
- Expiry date support per file
- Final onboarding completion summary

Admin onboarding file review:

- Admins can browse employee onboarding uploads from `/admin/onboarding-files`

### Tasks

Route:

- `/tasks`

Files:

- [app/tasks/page.tsx](C:/vlworkhub/apps/hr-app/app/tasks/page.tsx)
- [components/tasks-workspace.tsx](C:/vlworkhub/apps/hr-app/components/tasks-workspace.tsx)
- [lib/task-visibility.ts](C:/vlworkhub/apps/hr-app/lib/task-visibility.ts)

Purpose:

- Create, assign, track, complete, and archive tasks

What it does:

- Supports user assignments, department assignments, and all-staff assignments
- Tracks per-user task completion
- Calculates assignment progress
- Shows completed/incomplete assignees
- Supports admin archiving of completed tasks

Task behavior:

- Employees see only tasks they are entitled to
- Managers can see their own and report-related tasks according to visibility rules
- Admins can see broad task scope but should only act on tasks when appropriately assigned by workflow

Task statuses used in the UI:

- Not Started
- In Progress
- Completed
- Blocked

Admin archive view:

- `/admin/archived-tasks`

### Training

Route:

- `/training`

Files:

- [app/training/page.tsx](C:/vlworkhub/apps/hr-app/app/training/page.tsx)
- [components/training-workspace.tsx](C:/vlworkhub/apps/hr-app/components/training-workspace.tsx)
- [app/training/[id]/page.tsx](C:/vlworkhub/apps/hr-app/app/training/[id]/page.tsx)
- [components/training-detail-view.tsx](C:/vlworkhub/apps/hr-app/components/training-detail-view.tsx)

Purpose:

- Manage training library items and assignments

What it does:

- Maintains a training library
- Creates training definitions with:
  - `training_name`
  - `video_iframe_link`
  - `quiz_iframe_link`
- Assigns training to:
  - users
  - departments
  - all staff
- Shows status per viewer
- Allows archive of completed assignments

User flow:

- Admin creates training
- Admin assigns training
- User opens the training detail page
- User views embedded video and quiz content
- User completes training

Admin archive view:

- `/admin/archived-trainings`

### Surveys

Route:

- `/surveys`

Files:

- [app/surveys/page.tsx](C:/vlworkhub/apps/hr-app/app/surveys/page.tsx)
- [components/surveys-workspace.tsx](C:/vlworkhub/apps/hr-app/components/surveys-workspace.tsx)
- [app/surveys/[id]/page.tsx](C:/vlworkhub/apps/hr-app/app/surveys/[id]/page.tsx)
- [components/survey-detail-view.tsx](C:/vlworkhub/apps/hr-app/components/survey-detail-view.tsx)

Purpose:

- Manage survey library items and assignments

What it does:

- Creates survey definitions
- Assigns surveys to users, departments, or all staff
- Tracks survey completions
- Filters visibility by HR role and assignment audience

Admin archive view:

- `/admin/archived-surveys`

### Documents

Routes:

- `/documents`
- `/documents/[id]`

Files:

- [app/documents/page.tsx](C:/vlworkhub/apps/hr-app/app/documents/page.tsx)
- [components/documents-workspace.tsx](C:/vlworkhub/apps/hr-app/components/documents-workspace.tsx)
- [app/documents/[id]/page.tsx](C:/vlworkhub/apps/hr-app/app/documents/[id]/page.tsx)
- [components/document-detail-view.tsx](C:/vlworkhub/apps/hr-app/components/document-detail-view.tsx)

Purpose:

- Registry-based document assignment, review, signing, completion, and archive workflow

What it does:

- Uploads documents
- Supports multi-assignee workflows
- Supports:
  - direct user assignment
  - department assignment
  - all-staff assignment
- Supports sensitive documents
- Supports allow-download flag
- Uses a full-page detail view for document preview
- Uses signing flow and status tracking
- Stores uploads in local storage through the API

Important document rules:

- Sensitive documents have stricter open/sign behavior
- A document can require signature
- Download is controlled per document
- Signed-file copies are retained in signer folders

Admin document audit views:

- `/admin/signed-files`
- `/admin/onboarding-files`

### Admin

Route:

- `/admin`

Files:

- [app/admin/page.tsx](C:/vlworkhub/apps/hr-app/app/admin/page.tsx)
- [components/hr-admin-panel.tsx](C:/vlworkhub/apps/hr-app/components/hr-admin-panel.tsx)

Purpose:

- Central HR administration page

What it does:

- Manages HR role assignments
- Shows current HR assignments table
- Supports create/edit/delete HR role assignment modal flow
- Provides admin navigation cards to specialized operational views

Current admin operational cards include:

- Signed user folders
- Employee onboarding files
- Archived trainings
- Archived tasks

### Employees Directory

Route:

- `/employees`

File:

- [app/employees/page.tsx](C:/vlworkhub/apps/hr-app/app/employees/page.tsx)

Purpose:

- Employee directory entry point

Note:

- This route exists in the app tree and should be reviewed if it is intended for production use or future expansion.

## Backend Route Summary

Main HR routes:

- `GET /hr/my-role`
- `GET /hr/dashboard`
- `GET /hr/documents`
- `POST /hr/documents`
- `PUT /hr/documents/:id`
- `DELETE /hr/documents/:id`
- `POST /hr/documents/:id/sign`
- `POST /hr/documents/:id/complete`
- `POST /hr/documents/:id/archive`
- `GET /hr/documents/:id/download`
- `GET /hr/documents/signed-files`
- `GET /hr/onboarding/files`
- `POST /hr/onboarding/files`
- `PUT /hr/onboarding/files/item`
- `DELETE /hr/onboarding/files/item`
- `GET /hr/onboarding/files/admin`
- `PUT /hr/onboarding/files/admin/item`
- `DELETE /hr/onboarding/files/admin/item`
- `GET /hr/roles`
- `POST /hr/roles`
- `PUT /hr/roles/:userId`
- `DELETE /hr/roles/:userId`

Legacy/shared resource routes are also used by several modules through:

- `/resources/...`

## Data and Storage Behavior

### PostgreSQL

The API depends on PostgreSQL.

Relevant file:

- [services/api/src/config/db.ts](C:/vlworkhub/services/api/src/config/db.ts)

Required env var:

- `DATABASE_URL`

### Local upload storage

The API serves static uploads from:

- `/uploads`

Configured in:

- [services/api/src/server.ts](C:/vlworkhub/services/api/src/server.ts)

Observed upload areas in current implementation:

- `uploads/original`
- `uploads/signed`
- `uploads/onboarding`

### Onboarding upload metadata

Onboarding file metadata is persisted through:

- `hr_onboarding_uploads`

Current metadata includes:

- organization
- user
- stored file name
- original file name
- document type
- file URL
- expiry date
- uploaded time

## Setup Instructions

### Prerequisites

- Node.js compatible with the workspace
- npm with workspaces enabled
- PostgreSQL
- A valid `DATABASE_URL`
- JWT/session configuration compatible with the shared VLWorkHub auth package

### Key environment settings

From [services/api/src/config/env.ts](C:/vlworkhub/services/api/src/config/env.ts):

- `DATABASE_URL`
- `JWT_SECRET`
- `API_HOST` default: `0.0.0.0`
- `API_PORT` default: `8080`
- `ALLOWED_ORIGINS`
- `COOKIE_DOMAIN` optional

Frontend middleware defaults:

- `NEXT_PUBLIC_ROOT_URL` default: `http://localhost:3000`
- `NEXT_PUBLIC_API_URL` default: `http://localhost:8080`

### Install dependencies

From the repo root:

```bash
npm install
```

### Run the full monorepo in development

From the repo root:

```bash
npm run dev
```

This starts:

- API
- Main platform
- Care app
- HR app
- URSafe app

### Run only the HR app

```bash
npm run dev -w @vlworkhub/hr-app
```

Default HR app URL:

- `http://localhost:3002`

### Run only the API

Development watch mode:

```bash
npm run dev -w @vlworkhub/api
```

Production-style start sequence used by the root workspace:

```bash
npm run build -w @vlworkhub/auth
npm run build -w @vlworkhub/api
npm run start -w @vlworkhub/api
```

Default API URL:

- `http://localhost:8080`

### Database verification

The API verifies PostgreSQL at startup.

Startup behavior:

- If DB connection succeeds, the API starts and logs success
- If DB connection fails, the API exits

## Permission Behavior Summary

### Shell/admin visibility

- Admin nav item appears only for platform `ADMIN` or `SUPER_ADMIN`

### HR role visibility

HR permission helpers:

- `canManageDefinitions(role)`
- `canViewAll(role)`
- `canViewReports(role)`
- `canActOnOwn(role)`

Current semantics:

- `admin`
  - full visibility
  - can manage definitions
- `manager`
  - can view reports
  - scoped visibility to self plus direct reports, depending on module
- `employee`
  - self-only visibility by default

### Resource filtering examples

- Announcements
  - user sees published/active audience-matching announcements
- Tasks
  - audience and assignment based
- Task assignments/completions
  - filtered by visible users/departments
- Training assignments/completions
  - filtered by visible assignees
- Survey assignments/completions
  - filtered by visible assignees/departments
- Documents
  - filtered by assignment and document rules

## Operational Notes

### API connectivity

If the HR app says it cannot reach the API:

- confirm API is running on port `8080`
- confirm `NEXT_PUBLIC_API_URL` points to the correct API host
- confirm CORS allowed origins include the HR app URL
- confirm the browser is using the same host strategy consistently during development

### Localhost vs LAN access

During development, parts of the current setup assume localhost-style access unless environment settings are updated consistently across:

- frontend URL
- API URL
- allowed origins
- cookie/session behavior

### Generated and legacy content

The repo includes:

- legacy SPFx implementation under `apps/hr-app/legacy-spfx`
- generated Next build output under `.next`

Those areas are not the primary runtime source for the current HR portal, but they are useful as historical reference and for migrated module content like onboarding.

## Recommended Files to Review First

If a new developer needs to understand the HR portal quickly, start here:

- [apps/hr-app/components/hr-portal-shell.tsx](C:/vlworkhub/apps/hr-app/components/hr-portal-shell.tsx)
- [apps/hr-app/lib/hr-client.ts](C:/vlworkhub/apps/hr-app/lib/hr-client.ts)
- [apps/hr-app/lib/use-hr-role.ts](C:/vlworkhub/apps/hr-app/lib/use-hr-role.ts)
- [services/api/src/server.ts](C:/vlworkhub/services/api/src/server.ts)
- [services/api/src/routes/hr-routes.ts](C:/vlworkhub/services/api/src/routes/hr-routes.ts)
- [services/api/src/lib/hr-permissions.ts](C:/vlworkhub/services/api/src/lib/hr-permissions.ts)

Then review each workspace component:

- [components/hr-dashboard.tsx](C:/vlworkhub/apps/hr-app/components/hr-dashboard.tsx)
- [components/announcements-workspace.tsx](C:/vlworkhub/apps/hr-app/components/announcements-workspace.tsx)
- [components/onboarding-workspace.tsx](C:/vlworkhub/apps/hr-app/components/onboarding-workspace.tsx)
- [components/tasks-workspace.tsx](C:/vlworkhub/apps/hr-app/components/tasks-workspace.tsx)
- [components/training-workspace.tsx](C:/vlworkhub/apps/hr-app/components/training-workspace.tsx)
- [components/surveys-workspace.tsx](C:/vlworkhub/apps/hr-app/components/surveys-workspace.tsx)
- [components/documents-workspace.tsx](C:/vlworkhub/apps/hr-app/components/documents-workspace.tsx)
- [components/hr-admin-panel.tsx](C:/vlworkhub/apps/hr-app/components/hr-admin-panel.tsx)

## Assumptions and Scope of This README

This README is based on the current live code structure in:

- `apps/hr-app`
- `services/api/src`

It is intended as an operational summary, not a full schema reference.

Some modules still use generic resource endpoints and mixed legacy/current patterns. Where that occurs, this README describes the observable current behavior rather than prescribing a redesign.
