# Useful Files Kept

This production repo intentionally keeps only files that help ship the production app.

## Kept

- `apps/web`: lean MiniPay-facing app shell.
- `packages/core`: pure domain logic and tests.
- `services/api`: backend API shell.
- `services/worker`: scheduler/reconciliation shell.
- `docker`: production web/API/worker images and compose files.
- `ops/agent-registry`: ERC-8004 metadata and registration script.
- `public`: public agent metadata, icon, legal/support/stats placeholders.
- `docs`: deployment, positioning, architecture, and runbook docs.
- `.env.example`: non-secret environment contract.
- `.github/workflows/ci.yml`: production checks.

## Not Kept

- MVP `dist`.
- MVP `node_modules`.
- MVP one-file React monolith.
- MVP CSS monolith.
- Local logs.
- Local screenshots.
- Private keys.
- Any placeholder secrets.

## Why

The production repo should move fast without carrying prototype weight. MVP ideas were converted into reusable production modules:

- command parsing,
- duplicate detection,
- Celo receipt links,
- MiniPay wallet detection,
- ERC-8004 registration,
- Dockerized services.
