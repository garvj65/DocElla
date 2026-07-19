# DocElla

DocElla is planned as a PDF-to-form workflow application. This repository currently contains only the initial TypeScript monorepo scaffold.

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

Copy `.env.example` when local environment variables are needed. Do not commit real `.env` files.

## Development

```powershell
npm run dev
npm run dev -w @docella/frontend
npm run dev -w @docella/backend
```

- Frontend: http://localhost:5173
- Backend health endpoint: http://localhost:3001/api/health

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
apps/backend    Express TypeScript health endpoint
packages/schemas Shared TypeScript exports
```
