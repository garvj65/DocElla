# DocElla 1.0.0 Release Checklist

Complete this checklist after the release-hardening pull request is merged and before publishing the
`v1.0.0` tag.

## Automated gates

- [ ] Repository formatting passes.
- [ ] Lint passes.
- [ ] Type-check passes.
- [ ] Shared, backend, and frontend tests pass.
- [ ] Production build verification passes.
- [ ] Compiled production smoke passes.
- [ ] Docker image builds and starts as non-root.
- [ ] Docker health and frontend checks pass.

## Secret and deployment gates

- [ ] A production hosting service is configured from the Dockerfile.
- [ ] `GROQ_API_KEY` is stored as a backend secret.
- [ ] `FRONTEND_ORIGIN` exactly matches the public HTTPS origin.
- [ ] `TRUST_PROXY_HOPS` matches the trusted hosting proxy chain.
- [ ] `/api/health` is configured as the platform health check.
- [ ] No secret appears in image history, deployment logs, frontend assets, or repository history.

## Manual functional gates

- [ ] Job Application form generates an editable PDF.
- [ ] Job Application form generates a flattened PDF.
- [ ] Basic Invoice form generates an editable PDF.
- [ ] Basic Invoice form generates a flattened PDF.
- [ ] A synthetic text-based PDF extracts successfully with the real Groq key.
- [ ] Grounding summary and field badges render.
- [ ] Reviewed edits generate a PDF using the edited values.
- [ ] Invalid and scanned PDFs fail safely.
- [ ] Cancel and retry flows remain usable.

## Browser and accessibility gates

- [ ] Desktop Chrome smoke passes without console errors.
- [ ] Mobile-width smoke has no horizontal page overflow.
- [ ] Workflow tabs and primary actions are keyboard-accessible.
- [ ] Focus is visible.
- [ ] Loading, success, and error messages are announced.
- [ ] Downloads open successfully.
- [ ] Editable output retains form fields.
- [ ] Flattened output has no editable fields.

## Privacy gates

- [ ] No document values appear in URLs.
- [ ] No document values appear in local or session storage.
- [ ] No source text or raw provider response appears in the UI.
- [ ] No internal asset path or PDF field name appears in frontend assets.
- [ ] No uploaded or generated PDF remains on the service filesystem.
- [ ] Logs contain only safe request metadata.

## Release publication

- [ ] Merge the release-hardening PR with a verified head SHA.
- [ ] Pull the merged `main` branch locally.
- [ ] Create an annotated `v1.0.0` tag at the merge commit.
- [ ] Push the tag.
- [ ] Create the GitHub release from `CHANGELOG.md`.
- [ ] Mark the release as the latest stable release.
- [ ] Record the deployment URL and final smoke result in the release notes.
