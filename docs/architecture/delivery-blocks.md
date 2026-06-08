# Delivery Blocks

This file is the working rhythm for Choco production. Instead of trying to finish the whole app at once, we close one block at a time: define the goal, touch the smallest useful set of files, validate the result, update the docs, and commit the work.

The table below shows what is already complete and why it counts as complete. The next-block sections show where to continue without mixing stages or losing context. When a block is done, move it into `Completed`, add the evidence, and keep the next block focused.

Use `docs/architecture/architecture.md` when you need to understand how the app is built or where to debug a problem. Use this file when you need to decide what block to close next.

## Block Template

```text
Block:
Goal:
Files:
Validation:
Docs updated:
Commit:
Status:
```

## Completed

| Block | Result | Evidence |
| --- | --- | --- |
| 1. Repo split | MVP and production are separated. MVP lives in `choco`; production lives in `Choco Minipay`. | `README.md`, `docs/architecture/deployment-stages.md` |
| 2. Production scaffold | Production repo has modular web, core, API, worker, Docker, ops, public, and docs folders. | `docs/architecture/useful-files.md`, project tree in `README.md` |
| 3. Docker-first setup | Docker, CI, and Vercel use `npm ci` with the committed lockfile. | `docker/*.Dockerfile`, `.github/workflows/ci.yml`, `vercel.json` |
| 4. Vercel deployment | Production web app deploys to `https://choco-minipay.vercel.app`. | `vercel.json`, `public/agent.json`, Vercel deployment |
| 5. UI/UX restore | Production app uses the richer Choco MVP interface while keeping production modules. | `apps/web/src/App.jsx`, `apps/web/src/styles.css` |
| 6. Documentation operating model | Delivery blocks and architecture docs explain how to continue and debug the app. | `docs/architecture/delivery-blocks.md`, `docs/architecture/architecture.md`, `README.md` |
| 7. Public review pages | Support, privacy, terms, and stats pages are review-ready, mobile-first, and linked from the in-app `?` panel. | `public/*.html`, `public/review.css`, `public/support.js`, `apps/web/src/App.jsx`, `apps/web/src/styles.css` |

## Current Block

Block: 8. MiniPay wallet integration

Goal: Replace demo wallet behavior with MiniPay provider behavior.

Files:

- `apps/web/src/modules/wallet/useMiniPayWallet.js`
- `apps/web/src/modules/wallet/useMiniPayWallet.test.js`
- `apps/web/src/App.jsx`
- `packages/core/src/config/celo.js`

Validation:

- MiniPay detection works in WebView.
- Verify wallet targets Celo Sepolia testnet chain ID `11142220`.
- After wallet verification, the UI asks for testnet funds and recipient contact confirmation.
- Send-now does not create a `Sent` receipt without a real chain transaction hash.
- Browser fallback remains readable.
- No message-signing auth dependency.

Status: Implementation ready; MiniPay WebView validation pending after deploy.

## Next Blocks

### 9. Agent Metadata And Registration

Goal: Confirm public metadata, owner wallet, agent ID, and registry evidence.

Files:

- `public/agent.json`
- `ops/agent-registry/agent.sepolia.json`
- `ops/agent-registry/register-agent.ts`
- `docs/runbook-celo-agent-registration.md`

Validation:

- `https://choco-minipay.vercel.app/agent.json` returns 200.
- Agent registry transaction hash and agent ID are recorded.

### 10. API Contracts

Goal: Move quote, identity, and transfer preview flows behind API contracts.

Files:

- `services/api/src/server.js`
- `packages/core/src/domain/*`
- `.env.example`

Validation:

- `/health` returns 200.
- API preview endpoint has tests or documented request examples.

### 11. Worker And Scheduling

Goal: Turn the scheduler shell into a documented recurring-transfer worker.

Files:

- `services/worker/src/scheduler.js`
- `packages/core/src/domain/duplicates.js`
- `.env.example`

Validation:

- Worker has dry-run logs.
- Failure and retry behavior are documented.

## Block Rules

- Finish one block before starting the next.
- Keep MVP-only files out of production.
- Update this file when a block moves to completed.
- Commit each block with a clear message.
- Record validation commands in the final note for the block.
