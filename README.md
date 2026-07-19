# DocElla

DocElla is planned as a PDF-to-form workflow application. This repository currently contains the TypeScript monorepo scaffold, shared document definitions, a backend API foundation, and the first backend PDF extraction slice.

OCR, authentication, frontend upload UI, grounding, confidence review, and PDF generation are not implemented yet.

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

The backend requires `FRONTEND_ORIGIN`, for example `http://localhost:5173`, and `GROQ_API_KEY`. `NODE_ENV` defaults to `development`, `PORT` defaults to `3001`, and `LOG_LEVEL` defaults to `info`.

Extraction configuration:

- `GROQ_API_KEY`: required Groq API key. Never commit real keys.
- `GROQ_MODEL`: strict structured-output model. Defaults to `openai/gpt-oss-20b`; also supports `openai/gpt-oss-120b`.
- `GROQ_TIMEOUT_MS`: provider timeout, default `30000`.
- `GROQ_MAX_RETRIES`: Groq SDK transient-error retries, default `1`.
- `GROQ_MAX_INPUT_CHARACTERS`: maximum normalized extracted text sent to the provider, default `30000`.
- `EXTRACT_RATE_LIMIT_WINDOW_MS`: extraction route rate-limit window, default `60000`.
- `EXTRACT_RATE_LIMIT_MAX`: extraction requests per window, default `10`.

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
- `POST /api/extract`

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

### Extraction endpoint

`POST /api/extract` accepts `multipart/form-data` with:

- `file`: one PDF file
- `schemaType`: a registered schema ID

Supported schemas:

- `job-application`
- `basic-invoice`

Limits and behavior:

- One PDF per request
- 10 MiB maximum upload size
- 50 page maximum
- Text-based PDFs only
- OCR is not supported
- Maximum normalized provider input is controlled by `GROQ_MAX_INPUT_CHARACTERS`
- Extraction responses include `Cache-Control: no-store`

Successful extraction responses use the standard success envelope with `schemaType`, `documentVersion`, and a `values` object. Every schema field is present, missing values are `null`, and no PDF text, filename, prompts, confidence values, or provider internals are returned.

Common extraction error codes include `UPLOAD_REQUIRED`, `UPLOAD_TOO_LARGE`, `UPLOAD_INVALID_TYPE`, `PDF_INVALID`, `PDF_PASSWORD_PROTECTED`, `PDF_NO_EXTRACTABLE_TEXT`, `PDF_PAGE_LIMIT_EXCEEDED`, `PDF_TEXT_LIMIT_EXCEEDED`, `PDF_PARSE_TIMEOUT`, `EXTRACTION_RATE_LIMITED`, `EXTRACTION_PROVIDER_TIMEOUT`, `EXTRACTION_PROVIDER_RATE_LIMITED`, `EXTRACTION_PROVIDER_UNAVAILABLE`, `EXTRACTION_PROVIDER_REJECTED`, and `EXTRACTION_OUTPUT_INVALID`.

Backend logs are structured JSON and intentionally exclude request bodies, response bodies, authorization and cookie headers, API-key headers, query strings, PDF bytes, extracted text, prompts, extracted values, and form values. Uploaded PDFs stay in memory only and are never persisted.

PDF uploads, PDF parsing, and Groq extraction are backend-only in this slice. Authentication, persistence, queues, frontend upload UI, grounding, confidence review, OCR, and PDF generation are not implemented yet. Scanned PDFs fail with `PDF_NO_EXTRACTABLE_TEXT`.

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
