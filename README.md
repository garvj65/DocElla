# DocElla

DocElla 1.0.0 is an end-to-end document-intelligence workspace for turning business documents into reviewable structured data and reviewed PDFs.

It supports three workflows:

- **Extract:** upload a supported business document, discover its structure, extract fields and tables, inspect grounded evidence, edit the result, validate it, and export reviewed JSON.
- **Template review:** extract a text-based PDF into a registered fixed schema, review and edit its values, and generate a reviewed PDF.
- **Create PDF:** complete a schema-driven web form and generate an editable or flattened PDF from a trusted server-side template.

The project is a TypeScript monorepo built with React/Vite, Express, shared Zod contracts, Groq structured outputs, deterministic local grounding, PDF.js text extraction, optional Azure Document Intelligence OCR/layout, and pdf-lib PDF generation.

> **Evaluation:** for the shortest path through the product, see [docs/EVALUATOR_GUIDE.md](docs/EVALUATOR_GUIDE.md).

## What DocElla demonstrates

DocElla is intentionally more than a prompt-to-JSON demo. The implementation includes explicit trust boundaries and recovery paths around document ingestion, model output, review, and PDF generation:

- validated multi-format upload boundaries and memory-only document handling
- local PDF.js extraction with optional OCR/layout for scanned and non-PDF formats
- bounded generic schema discovery with provider fallbacks and local validation
- strict, batched value extraction against generated JSON Schemas
- deterministic evidence grounding rather than model-authored citations
- editable human review with validation before export/generation
- trusted server-side PDF templates with editable and flattened output
- privacy-safe structured logging, rate limits, cancellation, timeouts, and safe provider diagnostics
- automated formatting, lint, type, test, release-build, and production-container gates

## Supported inputs

The generic **Extract** workflow accepts validated files from these families:

- digital and scanned PDF
- JPEG, PNG, BMP, TIFF, and HEIF images
- DOCX
- XLSX
- PPTX
- HTML

Digital text PDFs use the local PDF.js path. Scanned PDFs, images, Office documents, and HTML require optional Azure Document Intelligence credentials.

The generic pipeline discovers bounded sections, scalar fields, repeatable values, and flat tables. Discovery prefers Groq JSON Schema output, can fall back to JSON Object Mode when provider-side generated JSON cannot satisfy the discovery schema, and always validates the resulting schema locally. Value extraction remains schema-constrained, locally validated, and batched for larger documents.

## Fixed schemas and PDF templates

Registered schemas:

- Job Application
- Basic Invoice

Each schema has a trusted server-side AcroForm template. Clients submit only public schema and template identifiers; they cannot provide filesystem paths, field mappings, template bytes, output paths, or output filenames.

## Architecture

```text
Browser
   |
   v
Express production service
   |-- compiled Vite frontend
   |-- GET /api/health
   |-- GET /api/schemas
   |-- POST /api/documents/extract
   |      file validation
   |      -> PDF.js or OCR/layout
   |      -> bounded schema discovery
   |      -> local schema validation
   |      -> batched strict value extraction
   |      -> deterministic evidence grounding
   |      -> reviewed JSON workflow
   |-- POST /api/extract
   |      fixed schema -> PDF.js -> Groq -> local grounding
   `-- POST /api/generate-pdf
          shared validation -> trusted template -> pdf-lib -> PDF download
```

Development runs Vite and Express separately. Production uses one same-origin Express process for the compiled frontend and API.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the trust and data-lifecycle boundaries.

## Prerequisites

- Node.js 24
- npm
- Git
- Docker only if you want to verify the production image locally

## Local setup

```powershell
git clone https://github.com/garvj65/DocElla.git
Set-Location .\DocElla
npm ci
Copy-Item .env.example .env
```

Set a backend-only Groq key in `.env`:

```env
GROQ_API_KEY=your-secret-key
```

For scanned PDFs, images, Office documents, and HTML, configure both optional Azure values:

```env
AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT=https://your-resource.cognitiveservices.azure.com
AZURE_DOCUMENT_INTELLIGENCE_KEY=your-backend-secret
```

Never place provider keys in `VITE_*` variables or commit `.env`.

Start development:

```powershell
npm run dev
```

Development endpoints:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:3001`

## UI workflows

### 1. Extract any supported business document

1. Open the **Extract** workspace.
2. Choose or drop one supported document up to 10 MiB.
3. Click **Analyze document**.
4. Review the detected document type, confidence, warnings, fields, tables, and evidence.
5. Edit scalar, repeatable, and table values where needed.
6. Validate the edited values against the discovered schema.
7. Export schema-valid reviewed JSON.

PDF and browser-safe images render inline. Other formats use a controlled summary and grounded evidence rather than executing or embedding source content.

### 2. Review a fixed-schema PDF

1. Select a registered schema.
2. Upload one text-based PDF.
3. Click **Extract**.
4. Review per-field grounding and edit the values.
5. Validate the reviewed form.
6. Choose a trusted template and editable or flattened output.
7. Generate and download the reviewed PDF.

### 3. Create a PDF from a form

1. Select a registered schema and template.
2. Complete the dynamic form.
3. Choose editable or flattened output.
4. Generate and download the PDF.

Editable PDFs retain AcroForm fields. Flattened PDFs convert field appearances into page content.

## Generic extraction reliability

Generic schema discovery and value extraction are intentionally separate.

Discovery uses this recovery order:

```text
strict JSON Schema
   -> best-effort JSON Schema when the provider rejects strict generation
   -> JSON Object Mode when generated JSON cannot satisfy the discovery schema
   -> local Zod validation and one correction attempt
```

The fallback does **not** make provider output authoritative. A discovered schema is accepted only after local validation.

Value extraction is stricter: DocElla builds JSON Schemas from the validated discovered schema, splits larger documents into bounded extraction batches, validates every batch locally, and then validates the merged result again.

A provider-only smoke command is available for separating Groq/account configuration from DocElla logic:

```powershell
npm run smoke:groq -w @docella/backend
```

It sends no uploaded document content.

## Grounding and review

Generic review states are:

- `verified`
- `needs_review`
- `missing`
- `conflicting`
- `low_ocr_confidence`

Confidence is a review heuristic, not a factual probability. Important documents require human review. Editing does not recompute the original grounding; an independent **Edited** indicator shows which values changed.

## Privacy and security boundaries

- Uploads, extracted content, reviewed values, and generated PDFs remain in memory.
- DocElla does not persist documents in a database or object store.
- Extraction and generation responses use `Cache-Control: no-store`.
- Complete source text, prompts, raw provider responses, credentials, internal asset paths, and PDF field names are not returned to the frontend.
- Browser previews use local object URLs and are revoked when no longer needed.
- HTML and Office files are not executed by the frontend.
- Backend logs redact request and response bodies, cookies, authorization and API-key headers, uploaded bytes, prompts, source text, extracted values, generated bytes, and provider failed-generation payloads.
- CORS accepts the configured frontend origin and requests without an Origin header.
- Extraction and generation use separate process-local rate limits.
- Proxy trust is an explicit bounded hop count and defaults to disabled.

See [SECURITY.md](SECURITY.md), [docs/GENERIC_EXTRACTION.md](docs/GENERIC_EXTRACTION.md), and [docs/OPERATIONS.md](docs/OPERATIONS.md).

## Environment variables

Required backend variables:

- `FRONTEND_ORIGIN`
- `GROQ_API_KEY`

Optional OCR/layout variables, configured together:

- `AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT`
- `AZURE_DOCUMENT_INTELLIGENCE_KEY`
- `AZURE_DOCUMENT_INTELLIGENCE_TIMEOUT_MS`
- `AZURE_DOCUMENT_INTELLIGENCE_POLL_INTERVAL_MS`

Common operational variables:

- `NODE_ENV`
- `PORT`
- `LOG_LEVEL`
- `TRUST_PROXY_HOPS`
- `SHUTDOWN_TIMEOUT_MS`
- `GROQ_MODEL`
- `GROQ_TIMEOUT_MS`
- `GROQ_MAX_RETRIES`
- `GROQ_MAX_INPUT_CHARACTERS`
- `EXTRACT_RATE_LIMIT_WINDOW_MS` and `EXTRACT_RATE_LIMIT_MAX`
- `GENERATE_RATE_LIMIT_WINDOW_MS` and `GENERATE_RATE_LIMIT_MAX`

Development may set:

```env
VITE_API_BASE_URL=http://localhost:3001
```

The production image uses same-origin API requests.

## Verification

The main repository gate is:

```powershell
npm run format:check
npm run lint
npm run typecheck
npm test
npm run verify:release
```

Additional backend checks:

```powershell
npm run verify:templates -w @docella/backend
npm run smoke:groq -w @docella/backend
npm run smoke:mocked -w @docella/backend
npm run smoke:pdf-generation -w @docella/backend
npm run smoke:production -w @docella/backend
```

`verify:release` builds all workspaces, verifies the frontend production bundle, and runs the compiled same-origin production smoke without contacting Groq. Pull requests and pushes to `main` also run the production Docker build, startup, health, frontend, and non-root checks in GitHub Actions.

## Production Docker image

```powershell
docker build -t docella:v1 .

docker run --rm -p 3001:3001 `
  -e NODE_ENV=production `
  -e PORT=3001 `
  -e FRONTEND_ORIGIN=http://localhost:3001 `
  -e GROQ_API_KEY=$env:GROQ_API_KEY `
  -e TRUST_PROXY_HOPS=0 `
  docella:v1
```

Open `http://localhost:3001`. The image runs as a non-root user and exposes `/api/health`.

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for provider-neutral deployment instructions.

## Known limitations

- No authentication, tenant isolation, database, or object-storage persistence.
- No background queue or resumable extraction jobs.
- No user-uploaded PDF templates.
- Generic schemas support flat primitive fields and flat repeated tables, not arbitrary nested objects.
- Generic extraction depends on model/provider reliability; local validation and fallbacks reduce failure modes but do not guarantee extraction success for every document.
- Legacy Office binaries, password-protected files, audio, video, executables, and proprietary binary formats are outside the supported boundary.
- Source evidence is shown as bounded snippets and locations; full visual coordinate highlighting is not implemented.
- Rate limits are process-local and are not distributed across replicas.
- Grounding verifies textual support, not factual correctness.
- Standard PDF appearance fonts may reject unsupported characters safely.

## Workspace structure

```text
apps/frontend    React/Vite workspaces, review UI, previews, validation, downloads
apps/backend     Express API, layout/OCR, extraction, grounding, generation, production serving
packages/schemas Shared definitions, generic contracts, and runtime Zod builders
```

## Project status

**DocElla 1.0.0 is the final submission build.**

The implementation is complete within the scope above and is suitable for local or Docker-based evaluation. Automated repository gates cover formatting, linting, TypeScript, tests, release artifacts, production container startup, health checks, frontend delivery, and non-root execution.

A hosted multi-user SaaS deployment is intentionally outside this project scope; production-hardening items such as authentication, tenant isolation, persistent storage, distributed queues, and distributed rate limiting are documented as explicit future boundaries rather than hidden assumptions.
