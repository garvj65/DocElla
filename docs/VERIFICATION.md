# Automated Release Verification

Run from the repository root:

```powershell
npm ci
npm run format:check
npm run lint
npm run typecheck
npm test
npm run verify:release
docker build -t docella:v1-candidate .
```

`npm run verify:release` builds all workspaces, verifies the frontend production bundle, and runs the
compiled same-origin production smoke. It does not call Groq.

Pull-request CI also starts the Docker image with a dummy provider key, verifies frontend and health
responses, verifies public schemas, and confirms that the container user is not root.

A real Groq extraction and manual browser checks remain required before the `v1.0.0` release tag.
