# VLWorkHub Architecture

VLWorkHub is a modular enterprise platform designed to replace multiple internal systems with a unified workspace.

Primary systems replaced:
- ShareVision (Care management)
- SharePoint HR portal
- UR Safe safety reporting

The platform uses a monorepo architecture.

---

# Core Architecture

Browser
↓
Next.js Applications
↓
Shared API Server
↓
MySQL Database

---

# Project Structure

apps/
- main-platform
- care-app
- hr-app
- ursafe-app

packages/
- ui (shared components)
- config (shared platform configuration)

services/
- api (Express backend)
- auth (JWT authentication)

infra/
- mysql
- nginx
- docker deployment

---

# Application Roles

Users authenticate once through the main platform.

Login flow:

Browser
→ main-platform
→ POST /auth/login
→ API server
→ JWT cookie returned

The cookie name is:

vlwh_session

Sub applications rely on the same session cookie.

---

# Sub Applications

## Main Platform
Location:
apps/main-platform

Purpose:
Entry dashboard for all systems.

Routes:
- /login
- /dashboard
- /applications

---

## HR System
Location:
apps/hr-app

Purpose:
Replace SharePoint HR portal.

Features:
- employee directory
- announcements
- tasks
- training
- documents
- surveys
- signatures

Important rule:

The HR system is NOT a generic CRUD app.

It must replicate the original HR portal workflows including:

- training assignment
- announcement publishing
- task assignment
- document signatures
- HR onboarding

Legacy reference code exists here:

apps/hr-app/legacy-spfx/src

Use this as reference when rebuilding workflows.

---

## Care System
Location:
apps/care-app

Purpose:
Replace ShareVision.

Features:
- client records
- case notes
- incidents
- document storage
- staff assignments

---

## UR Safe
Location:
apps/ursafe-app

Purpose:
Safety reporting and mileage tracking.

Features:
- mileage logs
- safety incidents
- emergency contacts
- safety checklists

---

# Shared UI

Location:
packages/ui

Components:
- sidebar
- top navigation
- login form
- notification center
- user profile menu

All applications must use these shared components.

Do not duplicate UI code.

---

# API Server

Location:
services/api

Runs on:

http://localhost:8080

Main endpoints:

POST /auth/login
POST /auth/logout
GET /auth/me

HR endpoints:
GET /employees
GET /tasks
GET /announcements
GET /training

---

# Development Ports

Main Platform
localhost:3000

HR App
localhost:3002

Care App
localhost:3001

UR Safe
localhost:3003

API
localhost:8080

---

# Rules for Codex

When modifying this project:

1. Do not break shared authentication.
2. Do not replace real workflows with generic CRUD forms.
3. Use the API server instead of direct database access.
4. Keep applications independent but connected through authentication.
5. Preserve legacy business logic from the SPFx portal when converting HR features.