# DocElla

DocElla is planned as a PDF-to-form workflow application. This repository currently contains the TypeScript monorepo scaffold, shared document definitions, a backend API foundation, PDF extraction and grounding, a frontend extraction review workflow, and a backend schema-driven PDF generation slice.

OCR, authentication, persistence, and frontend PDF generation/download are not implemented yet.

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
- `GENERATE_RATE_LIMIT_WINDOW_MS`: PDF generation route rate-limit window, default `60000`.
- `GENERATE_RATE_LIMIT_MAX`: PDF generation requests per window, default `20`.

## Development

```powershell
npm run dev
npm run dev -w @docella/frontend
npm run dev -w @docella/backend
```

- Frontend: http://localhost:5173
- Backend: http://localhost:3001

## Frontend

The frontend is a React 19 + Vite application. Tailwind CSS is integrated through
the Vite plugin, with local CSS tokens for the DocElla application shell. Data
loading uses TanStack Query, form state uses React Hook Form, and field validation
uses the shared public Zod builders from `@docella/schemas`.

Set `VITE_API_BASE_URL` when the API is not same-origin:

```env
VITE_API_BASE_URL=http://localhost:3001
```

The frontend loads only public schema configuration and submits extraction requests only after explicit user action:

- `GET /api/schemas`
- `GET /api/schemas/:schemaType`
- `POST /api/extract`

The form renderer supports public field kinds `text`, `textarea`, `email`,
`phone`, `date`, `number`, `currency`, and `select`. It renders labels,
descriptions, required indicators, placeholders, local validation errors, schema
selection, and registered template selection from public API responses. Runtime
API responses are validated before rendering, and local submission validation is
built from public configuration rather than internal document definitions.

Accessible primitives are implemented locally with Radix Label, Select, Tabs,
and Slot. The UI includes responsive loading, empty, and error states, visible
focus styles, and no authentication, analytics, routing, upload library, or state
store.

The Form-to-PDF tab intentionally does not send form values to the backend in this
slice. Values are not persisted in browser storage, URLs, cookies, or query keys.
PDF generation and download UI are deferred to T10. Public API config does not
contain internal template asset paths or PDF field names, and the frontend does
not render them.

### PDF-to-Form frontend workflow

The PDF-to-Form tab implements the T09 extraction review flow:

1. Select a public document schema.
2. Choose or drop exactly one PDF.
3. Run local PDF preflight checks.
4. Click `Extract` to send `multipart/form-data` to `POST /api/extract`.
5. Review grounding confidence, counts, warnings, and per-field badges.
6. Edit extracted values in the schema-driven reviewed form.
7. Validate reviewed fields locally.

Supported upload constraints:

- PDF files only, with MIME type `application/pdf` and a `.pdf` filename.
- Maximum size is 10 MiB.
- The first 1024 bytes must contain the `%PDF-` marker.
- Text-based PDFs are required.
- OCR remains unsupported, so scanned/image-only PDFs fail safely.

The frontend does not upload immediately when a file is selected. Active extraction
requests can be cancelled, and selecting another schema, choosing another file, or
starting over clears stale results. Retry is explicit and reuses only the currently
selected valid file.

Grounding review displays:

- `Verified` with exact or normalized match details.
- `Needs review` with fuzzy or no-source-match details.
- `Missing` when no value was extracted.
- Warning messages in backend order, with field keys converted to public labels.
- `Grounding confidence` as a deterministic review heuristic for the original
  extraction, not a probability, guarantee, or factual proof.

The reviewed form is prefilled from extracted values. Null textual, select, email,
date, and phone values become blank fields; null number and currency values remain
blank numeric values. Edited fields show a separate `Edited` indicator. Editing
does not recompute grounding, change the original grounding state, or send values
anywhere in T09. `Reset edits` restores the extraction result, while `Start over`
removes the selected file and extraction result.

Privacy boundaries:

- Files and extracted values remain in memory only.
- No local/session storage is used.
- No object URLs or PDF previews are created.
- No source text, source snippets, raw API JSON, provider prompts, model names,
  internal asset paths, or PDF field names are rendered.
- No `POST /api/generate-pdf` request is made from the T09 frontend workflow.
- Live extraction requires `GROQ_API_KEY` on the backend.

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
- `POST /api/generate-pdf`

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

Successful extraction responses use the standard success envelope with `schemaType`, `documentVersion`, `values`, and `review`. Every schema field is present in both `values` and `review`, missing values are `null`, and no PDF text, filename, prompts, source snippets, offsets, matching representations, or provider internals are returned.

### Grounding

After Groq returns locally validated structured values, DocElla compares each non-null extracted value against the normalized PDF text using deterministic local logic. No additional Groq request is made.

Per-field statuses are:

- `verified`: the value has strong deterministic support in the PDF text
- `needs_review`: the value is non-null but has weak support or no deterministic match
- `missing`: the extracted value is `null`

Per-field match types are:

- `exact`: minimally normalized value appears in the text
- `normalized`: a field-aware canonical representation matches
- `fuzzy`: conservative textual token-window matching reached the threshold
- `none`: no deterministic match was found, or the value is missing

Field confidence values are fixed heuristic scores: exact `1.00`, normalized `0.90`, fuzzy `0.60`, unmatched `0.25`, and missing `0.00`. Aggregate confidence averages every non-null extracted field plus every required missing field, while optional missing fields are excluded from the denominator. Required missing fields lower the score. Confidence is a review heuristic, not a provider probability, and values still require user review before important use.

Warnings use stable codes:

- `NO_VALUES_EXTRACTED`
- `REQUIRED_FIELDS_MISSING`
- `FIELDS_REQUIRE_REVIEW`
- `LOW_CONFIDENCE`

Grounding runs locally. Source text and snippets are not returned. Matching representations are not logged. Extraction responses remain non-cacheable.

Limitations:

- Fuzzy grounding is conservative.
- Grounding is evidence checking, not factual verification.
- A match elsewhere in a document can still be contextually wrong.
- OCR remains unsupported.
- Page coordinates and source highlighting are not implemented.

Common extraction error codes include `UPLOAD_REQUIRED`, `UPLOAD_TOO_LARGE`, `UPLOAD_INVALID_TYPE`, `PDF_INVALID`, `PDF_PASSWORD_PROTECTED`, `PDF_NO_EXTRACTABLE_TEXT`, `PDF_PAGE_LIMIT_EXCEEDED`, `PDF_TEXT_LIMIT_EXCEEDED`, `PDF_PARSE_TIMEOUT`, `EXTRACTION_RATE_LIMITED`, `EXTRACTION_PROVIDER_TIMEOUT`, `EXTRACTION_PROVIDER_RATE_LIMITED`, `EXTRACTION_PROVIDER_UNAVAILABLE`, `EXTRACTION_PROVIDER_REJECTED`, and `EXTRACTION_OUTPUT_INVALID`.

### PDF generation endpoint

`POST /api/generate-pdf` accepts JSON:

```json
{
  "schemaType": "job-application",
  "templateId": "job-application-default",
  "flatten": false,
  "values": {
    "fullName": "Alex Morgan",
    "email": "alex@example.test",
    "phone": "+1 555 010 2200",
    "address": "123 Example Street",
    "positionAppliedFor": "Product Analyst"
  }
}
```

`schemaType` must be a registered schema ID, `templateId` must be one of that schema's registered template IDs, `values` must satisfy the shared submission schema, and `flatten` is optional. When `flatten` is omitted, the template's registered `flattenByDefault` setting is used.

Successful generation intentionally returns raw binary PDF bytes rather than the normal JSON success envelope. Response headers include `Content-Type: application/pdf`, `Content-Disposition: attachment; filename="docella-....pdf"`, exact `Content-Length`, `Cache-Control: no-store`, and `X-Request-Id`. Error responses continue to use the standard JSON error envelope.

Registered generation templates:

- `job-application` with `job-application-default`
- `basic-invoice` with `basic-invoice-default`

Common generation error codes include `GENERATION_RATE_LIMITED`, `INVALID_GENERATION_REQUEST`, `INVALID_GENERATION_VALUES`, `UNKNOWN_SCHEMA`, `UNKNOWN_TEMPLATE`, `PDF_TEMPLATE_UNAVAILABLE`, `PDF_TEMPLATE_INVALID`, `PDF_TEMPLATE_MAPPING_INVALID`, `PDF_VALUE_UNSUPPORTED`, and `PDF_GENERATION_FAILED`.

### Template architecture

PDF templates are trusted server assets under the backend asset root. Template IDs are public, but asset paths and AcroForm field names stay internal. Field mappings come from the shared document definitions through each field's `pdfFieldName`; clients cannot provide filesystem paths, PDF bytes, output filenames, or field mappings.

Template assets are generated by `npm run generate:templates -w @docella/backend` and structurally checked by `npm run verify:templates -w @docella/backend`. Verification loads every registered template, checks that the asset remains under the trusted root, rejects unsupported XFA forms, and confirms the AcroForm fields exactly match the registered mappings. User-provided templates are not supported.

### PDF generation security and privacy

Submitted values are validated locally and are not logged. Generated PDFs are returned directly, are not persisted, and use `Cache-Control: no-store`. PDF generation does not make a Groq or other provider request. Client input cannot select arbitrary filesystem paths.

T07 uses the standard PDF appearance font. Characters unsupported by that font are rejected safely with `PDF_VALUE_UNSUPPORTED`; values are never silently replaced. Custom Unicode font embedding is deferred.

Generation rate limiting uses process-local memory. It is suitable for this local backend slice but is not a distributed limiter across multiple server processes.

Backend logs are structured JSON and intentionally exclude request bodies, response bodies, authorization and cookie headers, API-key headers, query strings, PDF bytes, extracted text, prompts, extracted values, and form values. Uploaded PDFs stay in memory only and are never persisted. Generated PDFs are not persisted.

PDF uploads, PDF parsing, Groq extraction, local grounding, and PDF generation are backend-only in this slice. Authentication, persistence, queues, frontend upload UI, and OCR are not implemented yet. Scanned PDFs fail with `PDF_NO_EXTRACTABLE_TEXT`.

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
