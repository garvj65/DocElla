# Generic Document Extraction

DocElla exposes a backend-only generic document-understanding endpoint:

```text
POST /api/documents/extract
```

The enterprise review workspace for this endpoint is delivered separately. The existing fixed-schema
PDF-to-Form and Form-to-PDF frontend remains unchanged in this pull request.

## Supported input families

The memory-only upload boundary accepts validated files from these families:

- Digital and scanned PDF
- JPEG, PNG, BMP, TIFF, HEIF
- DOCX
- XLSX
- PPTX
- HTML

Digital text PDFs use the local PDF.js layout path. Scanned PDFs, images, Office documents, and HTML
require the optional Azure Document Intelligence configuration described in `.env.example`.

Unsupported, corrupted, spoofed, encrypted, macro-enabled, path-traversing, or oversized files fail
before extraction. Uploaded bytes are not written to disk.

## Processing pipeline

```text
Validated document
  -> PDF.js or OCR/layout provider
  -> bounded schema discovery
  -> strict local schema validation
  -> generated value JSON Schema
  -> strict value extraction
  -> local value validation
  -> deterministic evidence grounding
  -> structured result
```

Schema discovery and value extraction are separate Groq structured-output requests. Both requests use
strict JSON Schema, temperature zero, prompt-injection-resistant document delimiters, and one
correction retry after a local validation failure.

## Response boundary

The successful response contains:

- Detected document metadata
- Bounded discovered sections, scalar fields, and tables
- Schema-shaped scalar values and table rows
- Per-field and per-table review states
- Bounded source-evidence anchors
- Aggregate confidence and warnings

The response does not include the complete source document text, raw provider responses, prompts,
credentials, filesystem paths, or document bytes.

Review states are:

- `verified`
- `needs_review`
- `missing`
- `conflicting`
- `low_ocr_confidence`

Confidence is a review heuristic, not a factual probability. Important documents still require human
review.

## Multipart request

Use one file in the `file` field:

```bash
curl -X POST http://localhost:3001/api/documents/extract \
  -H "Accept: application/json" \
  -F "file=@./synthetic-invoice.pdf"
```

The route uses the extraction rate limit, supports request cancellation, and returns
`Cache-Control: no-store`.

## Provider configuration

The generic route always requires the existing backend-only `GROQ_API_KEY`.

OCR and broad multi-format support additionally require this paired configuration:

```env
AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT=https://your-resource.cognitiveservices.azure.com
AZURE_DOCUMENT_INTELLIGENCE_KEY=your-backend-secret
```

Never expose either secret through a `VITE_*` variable, browser bundle, URL, log, test fixture, or
repository file.

## Current boundary

This release supports broad business-document ingestion but does not claim compatibility with every
binary format in existence. Audio, video, password-protected files, legacy Office binaries, arbitrary
proprietary formats, and executable documents remain outside the supported boundary.
