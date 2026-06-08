# Production File Review

This repository should stay focused on the production MiniPay app. Keep source, Docker, ops, and review assets here; keep the static MVP in `choco`.

## Keep

| Path | Why it belongs in production |
| --- | --- |
| `.github/workflows/ci.yml` | Runs production checks on push and pull requests. |
| `apps/web` | MiniPay-facing web app shell. |
| `packages/core` | Shared intent parsing, duplicate detection, receipt, amount, and Celo config logic. |
| `services/api` | Backend API shell for quotes, identity, and transfer orchestration. |
| `services/worker` | Scheduler and reconciliation shell for recurring transfers. |
| `docker` | Production and local service containers. |
| `ops/agent-registry` | ERC-8004 agent metadata generation and registration scripts. |
| `public/agent.json` | Public agent metadata served by the app. |
| `public/icon.svg` | Agent/app icon used by the metadata and review pages. |
| `public/privacy.html` | Required review surface; final legal content still needed. |
| `public/terms.html` | Required review surface; final legal content still needed. |
| `public/support.html` | Required review surface; final support process still needed. |
| `public/stats.html` | Useful for MiniPay/product review; real metrics still needed. |
| `docs` | Deployment stages, runbooks, positioning, and production handoff notes. |
| `.env.example` | Non-secret environment contract for local and deployed services. |
| `.dockerignore` | Keeps images small and excludes generated/local files. |
| `.gitignore` | Keeps generated/local files out of Git. |
| `package.json` | Scripts, dependencies, and repository metadata. |
| `vite.config.mjs` | Builds the web app from `apps/web` and serves `public`. |

## Keep Out

- `node_modules`
- `dist`
- `build`
- local logs
- local screenshots
- root-level MVP `src`
- MVP-only `index.html`
- MVP-only `agent.json`
- MVP-only `register-agent.ts`
- local secrets
- private keys

## Finish Before Release

- Add a committed `package-lock.json` for deterministic CI and Docker builds.
- Replace draft legal/support/stats pages with approved production content.
- Confirm the final agent metadata URL, owner wallet, and ERC-8004 registration evidence.
- Connect quote, ODIS, transfer, notification, analytics, and monitoring providers through the existing module boundaries.
- Validate MiniPay behavior at 360 x 640.
