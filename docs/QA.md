# Quality Assurance

DocElla's automated verification covers formatting, linting, type-checking, workspace tests, production builds, frontend bundle checks, compiled same-origin smoke tests, and production Docker startup.

## Automated release verification

The compiled production smoke verifies:

- frontend HTML delivery
- versioned health response
- public schema listing
- unknown API JSON errors
- editable PDF generation
- flattened PDF generation
- PDF signatures and non-cacheable binary responses
- same-origin production serving without requiring a live extraction provider

The Docker CI gate verifies:

- image build
- container startup
- health endpoint
- frontend delivery
- schema endpoint
- non-root runtime user

Backend tests additionally cover generic discovery/value extraction contracts, provider failure mapping, bounded payload handling, extraction batching, JSON Object discovery fallback, local validation, grounding, file validation, and PDF generation behavior.

## Provider-dependent verification

A minimal live Groq smoke can be run independently:

```powershell
npm run smoke:groq -w @docella/backend
```

This verifies the configured key/model and strict structured-output capability using a tiny synthetic schema. It sends no uploaded document content.

A real arbitrary-document run remains provider- and document-dependent. The final generic extraction path includes local validation, discovery fallbacks, bounded value-extraction batches, and privacy-safe diagnostics specifically so provider variability fails explicitly rather than silently producing trusted data.

## Manual product checks

For a short manual review, use [EVALUATOR_GUIDE.md](EVALUATOR_GUIDE.md).

The separate [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md) is a production-publication checklist for anyone deploying/tagging the project. Unchecked hosting or deployment items there are not required to evaluate the final local/Docker submission.
