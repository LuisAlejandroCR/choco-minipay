# Architecture

Choco MiniPay is built as a production app around the MVP experience, not as a copy of the MVP repository. The web interface keeps the richer Choco user journey, while the production repo separates the pieces that will need review, debugging, deployment, and ownership: web UI, shared domain logic, API, worker, Docker, public review pages, and agent registration ops.

The goal of this architecture is to make each block easy to reason about. A developer should be able to change wallet behavior without touching scheduling, adjust transfer parsing without opening the UI, or debug a deployed metadata issue without searching through the full app. Each folder has a clear job, and docs should be updated whenever that job changes.

The app is still in production-candidate shape. Some modules are shells that define the direction before the final providers are connected. That is intentional: it lets the team validate MiniPay behavior, Celo metadata, Docker deployment, and review surfaces before adding quote providers, ODIS lookup, real transaction execution, and database-backed recurring schedules.

## Runtime Shape

```text
MiniPay / Browser
  |
  +-- Web Speech API (SpeechRecognition / webkitSpeechRecognition)
  |     streams interim transcript into command state while recording
  |
  v
apps/web
  |-- renders the Choco user flow
  |-- detects MiniPay wallet availability
  |-- captures text and voice transfer commands
  |-- routes submitted commands to POST /v1/intent/preview
  |-- links public review pages and agent metadata
  |
  v
packages/core
  |-- parses transfer intent (regex; shared by API and local fallback)
  |-- detects duplicate plans
  |-- builds receipt links
  |-- stores Celo and MiniPay constants
  |
  v
services/api
  |-- health check
  |-- agent metadata endpoint
  |-- POST /v1/intent/preview  — resolves command to structured intent + quote
  |-- POST /v1/agent/preflight — four-point wallet/network/gas/recipient wallet check
  |-- GET  /v1/contacts        — list stored contacts (worker reads for recipient lookup)
  |-- POST /v1/contacts        — save contact { alias, walletAddress, network } from web app
  |
  v
services/worker
  |-- scheduled-transfer shell
  |-- retry/reconciliation shell
```

## Intent Resolution

Transfer commands go through two passes — one synchronous for live UI preview, one async through the API when the user submits.

**Live preview (while typing):** `buildPlanFromCommand` in `App.jsx` calls `parseTransferIntent` from `packages/core/src/domain/intent.js` inline on every render. No network call. The result drives the real-time plan preview in the editor.

**Submit pass (on text send or voice send):** `buildPlan` in `App.jsx` is async. It POSTs `{ command, deliveryMode }` to `POST /v1/intent/preview`, then builds the committed plan from the API's `intent` response via `buildPlanFromIntent`. The result is stored in `resolvedPreviewPlan` state and is what drives the processing screen, review screen, duplicate guard, and `confirmPlan`. If the API is unreachable, the same local regex serves as a transparent fallback so the user experience is unaffected.

**Voice input:** `PlanEditorScreen` uses `window.SpeechRecognition` or `window.webkitSpeechRecognition` (Android Chrome / MiniPay WebView). Interim results update `command` state in real time so the user sees the transcript as they speak. The send button stops recognition and calls `buildPlan` with the accumulated transcript — entering the same API submit path as text. Errors (permission denied, no-speech, unsupported browser) surface inline below the composer.

**Why the API owns this:** `POST /v1/intent/preview` currently wraps the same `parseTransferIntent` regex as the local path. That is intentional — once intent parsing graduates from regex to an LLM, only `services/api/src/server.js` changes. The frontend and domain layer are unchanged.

## Folder Roles

| Path | Role |
| --- | --- |
| `apps/web` | User-facing MiniPay web app. Keep UI, wallet status, navigation, and review links here. |
| `apps/web/src/screens` | One file per screen. Each screen is a self-contained React component that owns its local state, local effects, and JSX. App.jsx passes state and callbacks as props. |
| `apps/web/src/utils` | Pure helper functions shared across screens and App.jsx. Currently: `planUtils.js` (timestamp formatters, plan/transaction builders, duplicate-detection, demo timer). No React imports — independently testable. |
| `apps/web/src/components` | Reusable visual components: Choco mark, pitch screen, guided demo visuals, and extracted shared primitives (`BottomNav`, `LightSheet`, `SheetPrimitives`, `WalletCheckStatus`, `ContactCapture`). |
| `apps/web/src/content` | Pitch, guided-demo, and public-review copy separated from app routing. |
| `apps/web/src/config` | Runtime environment contract used by Vite and web modules. |
| `apps/web/src/data` | Low-value Celo Sepolia test scenario used by the UI. |
| `packages/core` | Shared business rules. Keep parsing, duplicate checks, receipt URLs, amount helpers, and Celo network constants here. |
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
| Wallet status is wrong | `apps/web/src/modules/wallet/useMiniPayWallet.js` | `packages/core/src/config/celo.js`, `.env`, MiniPay WebView, `window.ethereum.isMiniPay` |
| Transfer text parses wrong after submit | `services/api/src/server.js` → `/v1/intent/preview` → `parseTransferIntent` | Check API is running at `/health`; local fallback is `packages/core/src/domain/intent.js` |
| Transfer text parses wrong in live preview | `packages/core/src/domain/intent.js` | `packages/core/src/domain/intent.test.js` |
| Voice mic shows error or does nothing | `apps/web/src/modules/voice/useVoiceRecorder.js` → `hasSpeechSupport` and `voiceError` state | HTTPS or `localhost` required; Chrome / Android for MiniPay WebView; mic permission must be granted in browser |
| Voice transcript is wrong or garbled | `apps/web/src/modules/voice/voiceNormalize.js` → `normalizeVoiceTranscript` | Run `voiceNormalize.test.js` for regression; `SpeechRecognition.lang` is `en-US`; check ambient noise; Whisper fallback is Block 15 |
| Recipient wallet address missing in preflight | `ReviewScreen` → `ContactCapture` component | Check `getContact(plan.recipient)` in `useContacts.js`; if null, capture form shows and user must paste a valid `0x...` address before preflight passes |
| Contact not persisting across reloads | `apps/web/src/modules/contacts/useContacts.js` → `loadFromStorage` | Open DevTools → Application → localStorage → `choco-contacts-v1`; should be a JSON object keyed by lowercased alias |
| Contact not available to worker | `POST /v1/contacts` sync in `App.jsx::saveContactAndSync` | Check `GET /v1/contacts` on the running API; contacts are now persisted to `services/api/contacts.json` and survive server restarts |
| USDC balance wrong or missing (Block 12+) | `packages/core/src/domain/quote.js` → `POST /v1/quote` | Confirm `eth_call` to `balanceOf` on USDC contract; check `celo.js` USDC token address for the active network |
| Preflight passes but wallet check still shows blocked | `apps/web/src/modules/preflight/useAgentPreflight.js::run` — check `recipientAddressOverride` vs `getContact` path | Inspect the `recipientContact` value sent to `POST /v1/agent/preflight`; if it's an alias (not `0x...`), the contact was not saved or not looked up correctly |
| Duplicate warning is wrong | `packages/core/src/domain/duplicates.js` | `packages/core/src/domain/duplicates.test.js` — `planSignature` now handles both intent-shape and plan-shape via `??` fallbacks; Block 14 convergence is complete |
| Receipt link is wrong | `packages/core/src/domain/receipts.js` | `packages/core/src/config/celo.js` |
| Agent metadata is wrong | `public/agent.json` | `ops/agent-registry/agent.sepolia.json`, registration runbook |
| API is down | `services/api/src/server.js` and `/health` | Docker compose ports and `.env` |
| Worker loop is wrong | `services/worker/src/scheduler.js` | `WORKER_INTERVAL_MS`, Docker logs |
| Screen renders blank (ErrorBoundary) | `apps/web/src/main.jsx` → `AppErrorBoundary` | In dev mode, the error message shows inline; in production, open browser console for the original throw |

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
