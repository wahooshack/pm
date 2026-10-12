# Frontend

This Next.js app is exported and served by FastAPI. Use the root README for full-app startup; a standalone Next development server has no backend API.

With the root `.venv` prepared and Node 24 installed:

```text
npm ci
npm run lint
npm run test:unit
npm run test:e2e
```

The E2E command builds the export, then starts an isolated backend on 127.0.0.1:8765. All API and SQLite behavior is real; only OpenRouter is mocked. Generated output and reports are ignored.
