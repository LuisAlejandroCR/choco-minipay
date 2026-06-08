# Production File Review

This repository should stay focused on the production MiniPay app. Keep source, Docker, ops, and review assets here; keep the static MVP in `choco`.

## Keep

| Path | Why it belongs in production |
| --- | --- |
| `.github/workflows/ci.yml` | Runs production checks on push and pull requests. |
| `apps/web` | MiniPay-facing web app shell. |
| `apps/web/src/modules/wallet/useMiniPayWallet.js` | MiniPay/browser wallet detection and Celo Sepolia testnet verification. |
| `apps/web/src/modules/wallet/useMiniPayWallet.test.js` | Protects the Celo Sepolia testnet chain ID used by wallet verification. |
| `packages/core` | Shared intent parsing, duplicate detection, receipt, amount, and Celo config logic. |
| `packages/core/src/domain/preflight.js` | Choco Agent AI preflight rules for Celo Sepolia gas funds and recipient contact. |
| `packages/core/src/domain/preflight.test.js` | Protects agent preflight behavior before wiring real transfer execution. |
| `services/api` | Backend API shell for quotes, identity, and transfer orchestration. |
| `services/worker` | Scheduler and reconciliation shell for recurring transfers. |
| `docker` | Production and local service containers. |
| `ops/agent-registry` | ERC-8004 agent metadata generation and registration scripts. |
| `public/agent.json` | Public agent metadata served by the app. |
| `public/icon.svg` | Agent/app icon used by the metadata and review pages. |
| `public/privacy.html` | Required review surface; final legal content still needed. |
| `public/review.css` | Shared mobile-first styling for the public review pages. |
| `public/terms.html` | Required review surface; final legal content still needed. |
| `public/support.html` | Required review surface; final support process still needed. |
| `public/support.js` | Support-page behavior for topic chips, filled request copy, and request preparation. |
| `public/stats.html` | Useful for MiniPay/product review; real metrics still needed. |
| `docs` | Deployment stages, runbooks, positioning, and production handoff notes. |
| `.env.example` | Non-secret environment contract for local and deployed services. |
| `.dockerignore` | Keeps images small and excludes generated/local files. |
| `.gitignore` | Keeps generated/local files out of Git. |
| `package.json` | Scripts, dependencies, and repository metadata. |
| `package-lock.json` | Reproducible Node installs for Docker, CI, and Vercel. |
| `vercel.json` | Production web deployment settings for Vercel. |
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

- Replace draft legal/support/stats pages with approved production content.
- Connect the support form to the final chat, inbox, or ticket endpoint.
- Confirm the final agent metadata URL, owner wallet, and ERC-8004 registration evidence.
- Connect quote, ODIS, transfer, notification, analytics, and monitoring providers through the existing module boundaries.
- Validate MiniPay behavior at 360 x 640.
