# DocElla

DocElla 1.0.0 is a schema-driven PDF workflow application with two complete directions:

- Upload a text-based PDF, extract structured values, review grounding, edit the values, and
  generate a reviewed PDF.
- Complete a dynamic web form and generate either an editable or flattened PDF.

The application is a TypeScript monorepo with a React/Vite frontend, Express backend, shared Zod
contracts, Groq structured extraction, deterministic local grounding, PDF.js text extraction, and
pdf-lib generation from trusted AcroForm templates.

## Current v1 scope

Supported document schemas:

- Job Application
- Basic Invoice

Supported public field kinds:

- Text
- Text area
- Email
- Phone
- ISO date
- Number
- Currency
- Select

Each schema registers a trusted server-side PDF template. Clients select only public schema and
template IDs; they cannot provide filesystem paths, PDF mappings, template bytes, output paths, or
output filenames.

## Architecture

```text
Browser
   |
   v
Express production service
   |-- compiled Vite frontend
   |-- GET /api/health
   |-- GET /api/schemas
   |-- POST /api/extract
   |      PDF.js -> Groq structured output -> Zod validation -> local grounding
   |
   `-- POST /api/generate-pdf
          shared validation -> trusted template -> pdf-lib -> PDF download
```

Development runs Vite and Express separately. Production uses one same-origin Express process that
serves the compiled frontend before falling back to the JSON API error handler.

## Prerequisites

- Node.js 24 LTS
- npm
- Git
- Docker for production-image verification

## Local setup

```powershell
git clone https://github.com/garvj65/DocElla.git
cd DocElla
npm ci
Copy-Item .env.example .env
```

Set a legitimate backend-only Groq key in `.env`:

```env
GROQ_API_KEY=your-secret-key
```

Never place this key in a `VITE_*` variable or commit it to the repository.

Start both applications:

```powershell
npm run dev
```

Development endpoints:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:3001`

## Workflows

### PDF to reviewed form and PDF

1. Select a document schema.
2. Choose or drop one PDF.
3. Pass local file checks.
4. Click **Extract** explicitly.
5. Review aggregate confidence, warnings, and per-field grounding badges.
6. Edit extracted values.
7. Validate the reviewed values locally.
8. Choose a registered template and editable or flattened output.
9. Generate and download the reviewed PDF.

Upload constraints:

- Exactly one PDF.
- MIME type `application/pdf`.
- `.pdf` filename.
- Maximum 10 MiB.
- `%PDF-` marker within the first 1024 bytes.
- Maximum 50 pages.
- Extractable text is required.

Scanned or image-only documents are not supported because v1 does not include OCR.

### Form to PDF

1. Select a schema and registered template.
2. Complete the schema-generated form.
3. Choose editable or flattened output.
4. Generate and download the PDF.

Editable PDFs retain AcroForm fields. Flattened PDFs convert their appearances into page content.

## Grounding

After Groq returns schema-shaped values, the backend compares each non-null value with normalized
PDF text. Grounding is deterministic and does not make another provider request.

Statuses:

- `verified`: strong exact or normalized support.
- `needs_review`: weak, fuzzy, or absent deterministic support.
- `missing`: extracted value is `null`.

Confidence is a review heuristic, not a probability or factual guarantee. A matching value can still
be contextually wrong, so important documents require human review.

Editing does not recompute grounding. The badges continue to describe the original extraction, while
an independent **Edited** indicator shows user changes.

## Privacy and security boundaries

- Uploaded PDFs remain in memory and are not persisted.
- Extracted values and reviewed form values remain in memory and are not browser-persisted.
- Generated PDFs are returned directly and are not stored by the service.
- API responses for extraction and generation use `Cache-Control: no-store`.
- Form values are not placed in URLs, query keys, cookies, logs, or analytics.
- Source PDF text, prompts, source snippets, provider responses, asset paths, and PDF field names are
  not exposed to the frontend.
- Backend logs redact request bodies, response bodies, cookies, authorization headers, API-key
  headers, query strings, PDF bytes, prompts, source text, extracted values, and form values.
- CORS accepts only the configured frontend origin and requests without an Origin header.
- Extraction and generation have separate process-local rate limits.
- Production proxy trust is an explicit bounded hop count and defaults to disabled.

See [SECURITY.md](SECURITY.md) and [docs/OPERATIONS.md](docs/OPERATIONS.md).

## Environment variables

Required backend variables:

- `FRONTEND_ORIGIN`: exact allowed frontend origin with no path.
- `GROQ_API_KEY`: Groq secret used only by extraction.

Common optional variables:

- `NODE_ENV`: `development`, `test`, or `production`.
- `PORT`: backend port, default `3001`.
- `LOG_LEVEL`: structured log level, default `info`.
- `TRUST_PROXY_HOPS`: trusted reverse-proxy hop count, default `0`, maximum `10`.
- `SHUTDOWN_TIMEOUT_MS`: graceful-shutdown window, default `10000`.
- `GROQ_MODEL`: `openai/gpt-oss-20b` or `openai/gpt-oss-120b`.
- `GROQ_TIMEOUT_MS`: provider timeout, default `30000`.
- `GROQ_MAX_RETRIES`: provider retry count, default `1`.
- `GROQ_MAX_INPUT_CHARACTERS`: maximum normalized provider input, default `30000`.
- `EXTRACT_RATE_LIMIT_WINDOW_MS` and `EXTRACT_RATE_LIMIT_MAX`.
- `GENERATE_RATE_LIMIT_WINDOW_MS` and `GENERATE_RATE_LIMIT_MAX`.

Development may set:

```env
VITE_API_BASE_URL=http://localhost:3001
```

The production Docker build intentionally uses an empty `VITE_API_BASE_URL` for same-origin API
requests.

## Repository commands

```powershell
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
npm run verify:release
```

Additional backend verification:

```powershell
npm run verify:templates -w @docella/backend
npm run smoke:mocked -w @docella/backend
npm run smoke:pdf-generation -w @docella/backend
npm run smoke:production -w @docella/backend
```

`verify:release` builds all workspaces, verifies the frontend production bundle, and executes the
compiled same-origin production smoke without contacting Groq.

## Production Docker image

Build:

```powershell
docker build -t docella:v1 .
```

Run locally:

```powershell
docker run --rm -p 3001:3001 `
  -e NODE_ENV=production `
  -e PORT=3001 `
  -e FRONTEND_ORIGIN=http://localhost:3001 `
  -e GROQ_API_KEY=$env:GROQ_API_KEY `
  -e TRUST_PROXY_HOPS=0 `
  docella:v1
```

Open `http://localhost:3001`. The image runs as a non-root user and exposes `/api/health` for platform
health checks.

Detailed provider-neutral instructions are in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Adding a schema and trusted template

1. Add a flat document definition under `packages/schemas/src/definitions`.
2. Assign a unique schema ID, version, public field configuration, and internal `pdfFieldName` for
   each field.
3. Register the definition in `packages/schemas/src/registry.ts`.
4. Add or generate the trusted AcroForm template under `apps/backend/assets/templates`.
5. Register its public template ID and internal asset path in the document definition.
6. Run template generation and structural verification.
7. Add shared, backend, frontend, and generation tests.
8. Run the full repository and release gates.

Only trusted, committed templates are supported.

## Known v1 limitations

- No OCR or scanned-document extraction.
- No authentication or tenant isolation.
- No database or object-storage persistence.
- No user-uploaded templates.
- Flat primitive schemas only; no repeating tables or nested groups.
- No source highlighting or page coordinates.
- Standard PDF appearance font only; unsupported characters fail safely.
- Rate limits are in process memory and are not distributed across replicas.
- Grounding verifies textual support, not factual correctness.

## Workspace structure

```text
apps/frontend    React, Vite, dynamic forms, extraction review, downloads
apps/backend     Express API, extraction, grounding, generation, production serving
packages/schemas Shared definitions, public contracts, and Zod builders
```

## Release state

This branch prepares the `1.0.0` release candidate. A public deployment, Git tag, and GitHub release
must be created only after the final release-hardening pull request is reviewed and merged.
