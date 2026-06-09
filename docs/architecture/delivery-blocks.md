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
| 7. Public review pages | Support, privacy, terms, and stats pages are review-ready, mobile-first, and linked from the in-app `?` panel. | `public/*.html`, `public/review.css`, `public/support.js`, `apps/web/src/content/reviewLinks.js`, `apps/web/src/App.jsx`, `apps/web/src/styles.css` |
| 8. MiniPay wallet integration | Real MiniPay provider replaces demo behavior. Detection, network switching, agent preflight, MetaMask Mobile fallback, manual-address read-only mode, and send-now guard all verified locally. MiniPay WebView final validation pending deploy. | `apps/web/src/modules/wallet/useMiniPayWallet.js`, `apps/web/src/config/runtime.js`, `.env`, `apps/web/src/App.jsx`, `packages/core/src/domain/preflight.js`, `services/api/src/server.js`, `packages/core/src/config/celo.js` |
| 9. Agent Metadata And Registration | Agent #309 confirmed live on Celo Sepolia Identity Registry. Metadata URL returns 200. Evidence recorded in `ops/agent-registry/agent.sepolia.json` and runbook. Reputation Registry and `agentId` added to network config. Open item: tokenURI not content-addressed (`https://`); pin to IPFS and call `setAgentURI` before mainnet. | `ops/agent-registry/agent.sepolia.json`, `docs/runbook-celo-agent-registration.md`, `packages/core/src/config/celo.js` |

## Current Block

Block: 10. API Contracts

Goal: Move quote, identity, and transfer preview behind real API endpoints. Add x402 pay-per-request middleware so the API can charge per call without managing accounts.

Files:

- `services/api/src/server.js`
- `packages/core/src/domain/intent.js`
- `packages/core/src/domain/preflight.js`
- `apps/web/src/App.jsx`
- `.env`

Validation:

- [done] `GET /health` returns 200.
- [done] `POST /v1/intent/preview` is called from the frontend on every command submit; the API `intent` response drives the committed plan via `buildPlanFromIntent`. Local regex serves as a silent fallback if the API is unreachable.
- [done] `POST /v1/agent/preflight` returns all four preflight checks.
- [done] Voice input uses `SpeechRecognition` / `webkitSpeechRecognition`; interim transcript streams into command state in real time; submit triggers the same API intent path as text.
- [ ] x402 middleware returns 402 with a payment descriptor on unauthenticated calls to paid endpoints.
- [ ] Whisper transcription fallback for non-Chrome or offline environments (`POST /v1/voice/transcribe` + `services/transcriber/`).

Status: Phase 1 complete — text routes through API, voice uses SpeechRecognition. Remaining: x402 middleware, Whisper fallback.

### 11. Worker And Scheduling

Goal: Turn the scheduler shell into a documented recurring-transfer worker.

Files:

- `services/worker/src/scheduler.js`
- `packages/core/src/domain/duplicates.js`
- `.env`

Validation:

- Worker has dry-run logs.
- Failure and retry behavior are documented.

## Block Rules

- Finish one block before starting the next.
- Keep MVP-only files out of production.
- Update this file when a block moves to completed.
- Commit each block with a clear message.
- Record validation commands in the final note for the block.
