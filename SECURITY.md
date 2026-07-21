# Security Policy

## Supported version

Security fixes are currently prepared for the latest `1.0.x` release line after `v1.0.0` is
published. Older development commits are not maintained as supported releases.

## Reporting a vulnerability

Use GitHub's private vulnerability reporting feature for this repository when it is available. Do
not open a public issue containing exploit details, secrets, personal documents, or production data.

Include only the minimum safe information needed to reproduce the issue:

- Affected version or commit.
- A concise impact statement.
- Reproduction steps using synthetic data.
- The affected route or component.
- Suggested mitigation when known.

Do not include a real Groq key, uploaded PDF, extracted text, form values, or generated document.

## v1 security boundary

DocElla v1 is a single-user workflow service without authentication or tenant isolation. Deploy it
only where anonymous access is appropriate or where access is enforced by a trusted external layer.

The application does not claim to provide:

- User accounts or authorization.
- Tenant isolation.
- Long-term document storage.
- Audit-grade event retention.
- Malware scanning.
- OCR.
- Compliance certification.

## Secrets

`GROQ_API_KEY` is backend-only.

- Store it in the hosting provider's secret manager.
- Never commit it or include it in Docker build arguments.
- Never expose it through a `VITE_*` variable.
- Never include it in logs, screenshots, reports, shell transcripts, or support requests.
- Rotate it immediately when exposure is suspected.

The Docker image contains no default provider key.

## CORS and same-origin production

Production serves the Vite frontend and API from one Express process. CORS allows only the exact
`FRONTEND_ORIGIN` and requests without an Origin header. Wildcard origins are not used.

`TRUST_PROXY_HOPS` defaults to `0` and accepts only a bounded integer. Configure it only for a known
trusted proxy chain.

## Upload handling

- Exactly one PDF per extraction request.
- Maximum upload size: 10 MiB.
- Maximum page count: 50.
- Text-based PDFs only.
- Password-protected, invalid, scanned, and excessive documents fail safely.
- Uploads are stored in memory, not written to disk.
- Provider input is normalized and length-limited.

These controls do not replace malware scanning when documents are distributed to other systems.

## Trusted PDF templates

Generation uses only committed server templates below the trusted backend asset root. Public clients
cannot supply template paths, PDF bytes, output paths, field mappings, or output filenames.

Template verification rejects missing mappings, unsupported XFA, path escape, and inconsistent
AcroForm fields.

## Validation and output handling

- Public API contracts are strict and schema-driven.
- Extraction includes every configured key and uses `null` for missing values.
- Generation values must pass the shared non-null submission schema.
- Binary responses require PDF content type, nonempty bytes, and a `%PDF-` signature before browser
  download.
- Server filenames are treated as untrusted and sanitized by the frontend.
- Unsupported PDF font characters fail instead of being silently replaced.

## Persistence and caching

DocElla does not persist uploaded PDFs, extracted text, extracted values, reviewed values, or
generated PDFs. Extraction and generation responses use `Cache-Control: no-store`.

Temporary browser Blob URLs are revoked immediately after the download action.

## Logging

Structured application logs exclude bodies, document bytes, filenames, values, prompts, completion
content, authorization and cookie headers, API-key headers, query strings, internal template paths,
and PDF field names.

Request IDs and safe error codes should be used for diagnostics.

## Rate limiting

Extraction and generation have separate process-local IP rate limits. Generation limiting occurs
before JSON body parsing and PDF work.

The limiter is not distributed across replicas. Review this before horizontal scaling.

## Dependency security

Report a dependency vulnerability when it is exploitable in DocElla's supported runtime path. Include
the affected package, advisory identifier, installed version, and a synthetic proof of impact.

Do not submit automated scanner output without checking reachability and relevance.

## Synthetic test-data policy

Tests, bug reports, CI artifacts, and release verification must use synthetic names, addresses,
invoices, and PDFs. Never use real personal, customer, financial, employment, or confidential data.
