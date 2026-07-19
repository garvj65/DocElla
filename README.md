# DocElla

DocElla is planned as a PDF-to-form workflow application. This repository currently contains the initial TypeScript monorepo scaffold, shared document definitions, and a backend API foundation.

OCR, authentication, PDF extraction, and Groq integration are not implemented yet.

## Prerequisites

- Node.js 24 LTS
- npm
- Git

## Setup

```powershell
git clone https://github.com/garvj65/DocElla.git
cd DocElla
npm install
```

Copy `.env.example` to `.env` when local environment variables are needed. Do not commit real `.env` files.

The backend requires `FRONTEND_ORIGIN`, for example `http://localhost:5173`. `NODE_ENV` defaults to `development`, `PORT` defaults to `3001`, and `LOG_LEVEL` defaults to `info`.

## Development

```powershell
npm run dev
npm run dev -w @docella/frontend
npm run dev -w @docella/backend
```

- Frontend: http://localhost:5173
- Backend: http://localhost:3001

## Backend API

Run the backend during development with:

```powershell
npm run dev -w @docella/backend
```

Available endpoints:

- `GET /api/health`
- `GET /api/schemas`
- `GET /api/schemas/:schemaType`

Successful JSON responses use this envelope:

```json
{
  "success": true,
  "data": {},
  "meta": {
    "requestId": "..."
  }
}
```

Error responses use this envelope:

```json
{
  "success": false,
  "error": {
    "code": "ROUTE_NOT_FOUND",
    "message": "The requested route does not exist."
  },
  "meta": {
    "requestId": "..."
  }
}
```

Every response includes `X-Request-Id`, and the same value appears in `meta.requestId`. Clients may provide `X-Request-Id` when it contains only letters, numbers, `.`, `_`, or `-` and is 1-128 characters.

Backend logs are structured JSON and intentionally exclude request bodies, response bodies, authorization and cookie headers, API-key headers, query strings, extracted values, and form values.

PDF uploads, PDF parsing, Groq extraction, authentication, persistence, queues, and PDF generation are not implemented yet.

## Repository Gates

```powershell
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
```

## Workspace Structure

```text
apps/frontend   Vite React TypeScript scaffold
apps/backend    Express TypeScript API foundation
packages/schemas Shared TypeScript exports
```

## Document definition layer

Shared document definitions live in `packages/schemas`. They currently support flat
primitive fields only: text, textarea, email, phone, ISO `YYYY-MM-DD` date strings,
finite numbers, currency numbers, and selects.

This definition layer will later drive extraction, form rendering, validation, and
PDF field mapping from one source of truth. Extraction uses `null` when source
documents are missing a value, while missing object properties remain invalid.

Two definitions currently exist:

- Job Application
- Basic Invoice
