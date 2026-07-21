# Changelog

## [1.0.0] - 2026-07-21

### Added

- Shared declarative document definitions for Job Application and Basic Invoice.
- Strict public schema contracts and dynamic frontend forms for all supported primitive field kinds.
- Secure in-memory PDF upload with MIME, extension, size, signature, page, text, and timeout limits.
- PDF.js text extraction and Groq strict structured-output extraction.
- Local deterministic grounding with verified, needs-review, and missing states.
- Editable extraction review with confidence summaries, warnings, reset, cancellation, and stale-result
  protection.
- Trusted AcroForm template generation through pdf-lib.
- Editable and flattened PDF downloads from both direct forms and reviewed extraction results.
- Safe binary response validation, filename sanitization, and temporary Blob URL cleanup.
- Same-origin production serving through Express.
- A multi-stage non-root Docker image with an application health check.
- Proxy-aware IP handling with bounded trusted-hop configuration.
- Bounded graceful shutdown with idle and forced connection cleanup.
- Compiled production smoke coverage and Docker CI verification.
- Deployment, operations, privacy, and security documentation.

### Security and privacy

- Uploaded and generated PDFs remain memory-only and are not persisted by DocElla.
- Extraction and generation responses are non-cacheable.
- Logs exclude document bytes, document text, prompts, values, secrets, sensitive headers, and query
  strings.
- Client input cannot choose arbitrary template paths, field mappings, output paths, or filenames.
- Generation rate limiting runs before JSON body parsing and PDF work.

### Known limitations

- Text-based PDFs only; OCR is not supported.
- No authentication or tenant isolation.
- No database, object storage, or resumable jobs.
- Flat primitive document schemas only.
- No source coordinates or highlighting.
- Process-local rate limiting is not distributed across replicas.
- Standard PDF appearance font only; unsupported characters fail safely.
- Grounding checks textual support and does not prove factual correctness.
