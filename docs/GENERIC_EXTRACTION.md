# Generic Document Extraction

DocElla exposes a backend generic document-understanding endpoint and a matching **Extract** review workspace:

```text
POST /api/documents/extract
```

The workflow accepts a business document, discovers a bounded schema, extracts values into that schema, grounds the result against the local layout, and returns a reviewable structure that can be edited, validated, and exported as JSON.

## Supported input families

The memory-only upload boundary accepts validated files from these families:

- digital and scanned PDF
- JPEG, PNG, BMP, TIFF, and HEIF images
- DOCX
- XLSX
- PPTX
- HTML

Digital text PDFs use the local PDF.js layout path. Scanned PDFs, images, Office documents, and HTML require the optional Azure Document Intelligence configuration described in `.env.example`.

Unsupported, corrupted, spoofed, encrypted, macro-enabled, path-traversing, or oversized files fail before extraction. Uploaded bytes are not written to disk.

## Processing pipeline

```text
Validated document
  -> PDF.js or OCR/layout provider
  -> bounded schema discovery
       strict JSON Schema
         -> best-effort JSON Schema when strict generation is rejected
         -> JSON Object Mode for provider generated-JSON mismatch
  -> strict local schema validation
  -> generated value JSON Schemas
  -> bounded strict value-extraction batches
  -> local batch validation
  -> merged local value validation
  -> deterministic evidence grounding
  -> structured review result
```

Schema discovery and value extraction are separate provider operations.

### Discovery

Discovery uses a bounded contract for document type, language, sections, scalar fields, repeatable values, flat tables, labels, identifiers, and select options. The provider is instructed to use globally unique scalar-field identifiers so concepts repeated across sections do not collide in the flat value record.

The preferred mode is strict JSON Schema. A provider HTTP 400 can trigger best-effort schema output. When Groq reports that its generated JSON could not satisfy the supplied schema (`json_validate_failed`), discovery can fall back to JSON Object Mode.

JSON Object Mode is only a generation fallback. It does not bypass DocElla's contract: the resulting object must still pass the local `discoveredDocumentSchemaSchema` validation before it is used. Locally invalid output gets one correction attempt.

### Value extraction

Value extraction does not reuse the discovery fallback. Once the discovered schema has passed local validation, DocElla generates exact extraction JSON Schemas and extracts values in bounded strict batches.

Batching keeps larger real-world documents below provider schema/request complexity limits. Each batch is validated locally; merged fields and tables are then validated again against the complete discovered schema.

Provider input content is bounded, and HTTP 413 responses can retry with a smaller deterministic sample. Missing or ambiguous values remain explicit rather than being invented.

## Evidence and review

Grounding is computed locally from the document-layout result rather than trusting model-authored citations.

The successful response contains:

- detected document metadata
- bounded discovered sections, scalar fields, and tables
- schema-shaped scalar values and table rows
- per-field and per-table review states
- bounded source-evidence anchors
- aggregate confidence and warnings

The response does not include complete source document text, raw provider responses, prompts, credentials, filesystem paths, or document bytes.

Review states are:

- `verified`
- `needs_review`
- `missing`
- `conflicting`
- `low_ocr_confidence`

Confidence is a review heuristic, not a factual probability. Important documents still require human review.

## Multipart request

Use one file in the `file` field:

```bash
curl -X POST http://localhost:3001/api/documents/extract \
  -H "Accept: application/json" \
  -F "file=@./synthetic-invoice.pdf"
```

The route uses the extraction rate limit, supports request cancellation, and returns `Cache-Control: no-store`.

## Provider configuration

The generic route requires the backend-only `GROQ_API_KEY`.

A provider-only smoke command checks the configured model/key using a tiny known-valid strict schema without transmitting an uploaded document:

```powershell
npm run smoke:groq -w @docella/backend
```

OCR and broad multi-format support additionally require this paired configuration:

```env
AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT=https://your-resource.cognitiveservices.azure.com
AZURE_DOCUMENT_INTELLIGENCE_KEY=your-backend-secret
```

Never expose either secret through a `VITE_*` variable, browser bundle, URL, log, test fixture, or repository file.

## Safe diagnostics

Provider failures are mapped to sanitized application errors. Development/server logs may include bounded metadata such as provider status, error category/code, request ID, model, and extraction stage.

Local schema-validation failures may include only safe issue codes and structural paths. Complete document text, extracted values, prompts, provider failed-generation payloads, credentials, and raw request/response bodies are excluded from diagnostics.

## Current boundary

This release supports broad business-document ingestion but does not claim compatibility with every binary format or every possible document structure.

The generic schema is deliberately bounded to flat primitive fields and flat repeated tables. Audio, video, password-protected files, legacy Office binaries, arbitrary proprietary formats, executable documents, and deeply nested document schemas remain outside the supported boundary.

Provider/model generation can still fail on unusual inputs. DocElla's retries, discovery fallbacks, batching, and local validation are reliability controls, not a guarantee that every document can be extracted successfully.
