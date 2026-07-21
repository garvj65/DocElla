# Deployment

DocElla v1 is packaged as one Docker service. The Express process serves both the compiled Vite
frontend and the API, so browser requests are same-origin in production.

No public deployment is created by this repository change. A hosting account, production URL, and
Groq secret must be configured after the release-hardening pull request is merged.

## Build locally

```powershell
docker build -t docella:v1 .
```

The multi-stage image:

- Uses Node.js 24.
- Installs dependencies with `npm ci`.
- Builds shared schemas, backend code, and the frontend.
- Verifies the frontend bundle.
- Copies only runtime dependencies, compiled artifacts, frontend assets, and trusted templates.
- Runs as the non-root `node` user.
- Starts with `node apps/backend/dist/server.js`.

## Run locally

```powershell
docker run --rm -p 3001:3001 `
  -e NODE_ENV=production `
  -e PORT=3001 `
  -e FRONTEND_ORIGIN=http://localhost:3001 `
  -e GROQ_API_KEY=$env:GROQ_API_KEY `
  -e TRUST_PROXY_HOPS=0 `
  -e SHUTDOWN_TIMEOUT_MS=10000 `
  docella:v1
```

Open `http://localhost:3001` and verify `http://localhost:3001/api/health`.

## Required production settings

### `GROQ_API_KEY`

Store the key in the hosting provider's encrypted secret manager. Never pass it as a Docker build
argument, commit it, expose it to the frontend, or place it in a `VITE_*` variable.

### `FRONTEND_ORIGIN`

Set this to the exact public service origin:

```env
FRONTEND_ORIGIN=https://docella.example.com
```

Do not include a path, query, fragment, credentials, or trailing application route.

### `PORT`

DocElla respects the host-provided port. The image defaults to `3001` and exposes that port for local
use, but platforms may inject another value.

## Reverse proxies

`TRUST_PROXY_HOPS` defaults to `0`, which ignores forwarded client-IP headers.

Set it to `1` only when the service is behind exactly one trusted platform reverse proxy. Increase it
only when the full proxy chain is understood and controlled. Never use an unbounded trust setting.

Incorrect proxy trust can make IP-based rate limiting ineffective or attribute requests to the wrong
client.

## Health check

Use:

```text
GET /api/health
```

A healthy response is JSON with service, status, and public application version. It contains no
secrets, hostnames, filesystem paths, provider metadata, or commit identifiers.

The Docker image includes an internal health check using this endpoint.

## Generic Docker-platform deployment

These steps apply to Docker-capable services such as Render, Railway, Fly.io, or a managed container
platform:

1. Connect the GitHub repository.
2. Select Dockerfile-based deployment.
3. Do not override the image start command unless the platform requires it.
4. Add `GROQ_API_KEY` as a secret.
5. Set `NODE_ENV=production`.
6. Set `FRONTEND_ORIGIN` to the final HTTPS origin.
7. Set `TRUST_PROXY_HOPS` to the documented platform proxy count, usually `1`.
8. Configure `/api/health` as the health path.
9. Allow the platform to supply `PORT`, or set it explicitly when required.
10. Deploy and complete the smoke checklist below.

Do not add separate static-site hosting for the frontend unless the architecture is deliberately
changed and CORS is re-reviewed.

## Deployment smoke checklist

- `/` returns the DocElla frontend.
- `/api/health` returns status `ok` and version `1.0.0`.
- `/api/schemas` lists Job Application and Basic Invoice.
- An editable PDF can be generated.
- A flattened PDF can be generated.
- A synthetic text-based PDF can be extracted with the production Groq key.
- Reviewed values can generate a PDF.
- An invalid PDF is rejected without an extraction request.
- An unknown `/api/*` route returns the JSON `ROUTE_NOT_FOUND` envelope.
- Browser console contains no uncaught errors.
- No uploaded or generated files appear on the container filesystem.

## CORS troubleshooting

A browser CORS rejection usually means `FRONTEND_ORIGIN` does not exactly match the public origin.
Check scheme, hostname, and port. Do not solve the problem with `*` or by allowing arbitrary origins.

Requests without an `Origin` header remain allowed for health checks, command-line tools, and
server-to-server smoke tests.

## Cold starts and memory

The frontend and templates are local image assets. Extraction initializes the Groq client and PDF
processing in the backend process. Cold platforms may take longer on the first request.

Uploads, extracted text, reviewed values, and generated PDFs are memory-only. Choose a service size
that can safely handle the configured 10 MiB upload limit and concurrent PDF processing.

## Logs

Inspect structured JSON logs using the provider's log viewer. Use request IDs to correlate frontend
errors and backend events. Do not ask users to send document contents or secrets for diagnosis.

## Rollback

1. Identify the last known-good image or commit.
2. Redeploy that immutable image.
3. Verify `/api/health`, schema loading, and PDF generation.
4. Rotate `GROQ_API_KEY` if secret exposure is suspected.
5. Record the affected request IDs and safe error codes.

## Secret rotation

1. Create a new Groq key in the provider console.
2. Replace the hosting secret without changing frontend configuration.
3. Redeploy or restart the service.
4. Run one synthetic extraction smoke.
5. Revoke the old key.
6. Verify logs contain neither key.
