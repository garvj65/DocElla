# Release QA

Automated release verification covers formatting, linting, type-checking, unit and integration tests,
production builds, frontend bundle checks, compiled same-origin smoke tests, and Docker startup.

The compiled production smoke verifies:

- Frontend HTML delivery.
- Versioned health response.
- Public schema listing.
- Unknown API JSON errors.
- Editable PDF generation.
- Flattened PDF generation.
- PDF signatures and non-cacheable binary responses.
- No extraction or Groq request.

The Docker CI gate verifies:

- Image build.
- Container startup.
- Health endpoint.
- Frontend delivery.
- Schema endpoint.
- Non-root runtime user.

Before publishing `v1.0.0`, complete the manual and secret-dependent checks in
`docs/RELEASE_CHECKLIST.md`, including a real synthetic Groq extraction, desktop and mobile browser
smoke, keyboard navigation, and opening editable and flattened downloads.
