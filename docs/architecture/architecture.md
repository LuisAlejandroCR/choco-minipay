# Architecture

Choco MiniPay is built as a production app around the MVP experience, not as a copy of the MVP repository. The web interface keeps the richer Choco user journey, while the production repo separates the pieces that will need review, debugging, deployment, and ownership: web UI, shared domain logic, API, worker, Docker, public review pages, and agent registration ops.

The goal of this architecture is to make each block easy to reason about. A developer should be able to change wallet behavior without touching scheduling, adjust transfer parsing without opening the UI, or debug a deployed metadata issue without searching through the full app. Each folder has a clear job, and docs should be updated whenever that job changes.

The app is still in production-candidate shape. Some modules are shells that define the direction before the final providers are connected. That is intentional: it lets the team validate MiniPay behavior, Celo metadata, Docker deployment, and review surfaces before adding quote providers, ODIS lookup, real transaction execution, and database-backed recurring schedules.

## Runtime Shape

```text
MiniPay / Browser
  |
  v
apps/web
  |-- renders the Choco user flow
  |-- detects MiniPay wallet availability
  |-- links public review pages and agent metadata
  |
  v
packages/core
  |-- parses transfer intent
  |-- detects duplicate plans
  |-- builds receipt links
  |-- stores Celo and MiniPay constants
  |
  v
services/api
  |-- health check
  |-- agent metadata endpoint
  |-- transfer preview endpoint
  |
  v
services/worker
  |-- scheduled-transfer shell
  |-- retry/reconciliation shell
```

## Folder Roles

| Path | Role |
| --- | --- |
| `apps/web` | User-facing MiniPay web app. Keep UI, wallet status, navigation, and review links here. |
| `packages/core` | Shared business rules. Keep parsing, duplicate checks, receipt URLs, amount helpers, and Celo constants here. |
| `services/api` | Server boundary for provider integrations, quote previews, identity lookup, and transfer orchestration. |
| `services/worker` | Background boundary for schedules, retries, notifications, and reconciliation. |
| `ops/agent-registry` | ERC-8004 metadata generation and registration scripts. |
| `public` | Files Vercel serves directly: agent metadata, icon, privacy, terms, support, and stats. |
| `docker` | Container definitions for local service checks and production deployment. |
| `docs` | Working record of architecture, delivery blocks, deployment stages, and runbooks. |

## Build Flow

The web app uses Vite with `apps/web` as the root and `public` as the static asset directory. Production builds output to `dist/web`.

```text
package.json
  -> npm run build:web
  -> vite.config.mjs
  -> apps/web
  -> public
  -> dist/web
```

Docker, CI, and Vercel use `npm ci` so installs are reproducible from `package-lock.json`.

```text
package-lock.json
  -> npm ci
  -> npm run test
  -> npm run build:web
  -> docker compose config/build
  -> Vercel deployment
```

## Debug Flow

Start with the layer where the problem appears, then move inward.

| Symptom | First check | Next check |
| --- | --- | --- |
| Vercel shows 404 | `vercel.json`, GitHub push status, Vercel deployment logs | `dist/web`, build command, output directory |
| UI is stale | Latest commit pushed to `origin/main` | Vercel redeploy, browser hard refresh |
| Wallet status is wrong | `apps/web/src/modules/wallet/useMiniPayWallet.js` | MiniPay WebView, `window.ethereum.isMiniPay` |
| Transfer text parses wrong | `packages/core/src/domain/intent.js` | `packages/core/src/domain/intent.test.js` |
| Duplicate warning is wrong | `packages/core/src/domain/duplicates.js` | `packages/core/src/domain/duplicates.test.js` |
| Receipt link is wrong | `packages/core/src/domain/receipts.js` | `packages/core/src/config/celo.js` |
| Agent metadata is wrong | `public/agent.json` | `ops/agent-registry/agent.sepolia.json`, registration runbook |
| API is down | `services/api/src/server.js` and `/health` | Docker compose ports and `.env.example` |
| Worker loop is wrong | `services/worker/src/scheduler.js` | `WORKER_INTERVAL_MS`, Docker logs |

## Validation Commands

Use these before closing a block:

```bash
npm run test
npm run build:web
docker compose -f docker/docker-compose.production.yml config
```

Use the deployed URLs after pushing:

```text
https://choco-minipay.vercel.app
https://choco-minipay.vercel.app/agent.json
https://choco-minipay.vercel.app/privacy.html
https://choco-minipay.vercel.app/terms.html
```

## Change Rules

- Keep MVP-only files in `choco`, not in this production repo.
- Keep UI changes in `apps/web`.
- Keep reusable business rules in `packages/core`.
- Keep provider secrets and private integrations out of `VITE_*` variables.
- Keep registry operations in `ops/agent-registry` and the runbook.
- Update `docs/architecture/delivery-blocks.md` when a block is completed.
