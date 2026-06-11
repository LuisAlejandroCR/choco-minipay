# Production File Review

This repository should stay focused on the production MiniPay app. Keep source, Docker, ops, and review assets here; keep the static MVP in `choco`.

## Keep

| Path | Why it belongs in production |
| --- | --- |
| `.github/workflows/ci.yml` | Runs production checks on push and pull requests. |
| `apps/web` | MiniPay-facing web app shell. |
| `apps/web/src/App.jsx` | Root app state (~350 lines), screen routing, wallet guard, and the async `buildPlan` flow: POSTs to `/v1/intent/preview`, stores the resolved plan in `resolvedPreviewPlan`, then triggers preflight. All screen components have been extracted to `apps/web/src/screens/`; all pure helpers to `apps/web/src/utils/planUtils.js`. |
| `apps/web/src/screens/` | One file per screen: `SplashScreen`, `PlanScreen`, `WalletGateScreen`, `DemoTourScreen`, `PlansScreen`, `HistoryScreen`, `ReceiptDetailScreen`, `PlanDetailScreen`, `PlanEditorScreen` (voice input), `DeletePlanScreen`, `ProcessingScreen`, `DuplicateGuardScreen`, `ReviewScreen`, `QuickInfoPanel`. Each file owns only its own JSX, local state, and local effects. |
| `apps/web/src/utils/planUtils.js` | Pure module-scope helpers extracted from App.jsx: timestamp formatters, plan/transaction builders, duplicate-detection helpers, demo timer formatter. No React imports. Importable by both screen files and App.jsx. |
| `apps/web/src/modules/contacts/useContacts.js` | `localStorage` CRUD hook for Block 11 contacts. `getContact(alias)` returns a stored `{ alias, walletAddress, network }` record or null. `saveContact(alias, walletAddress)` validates and persists. App.jsx calls `saveContactAndSync` to also mirror to `POST /v1/contacts`. |
| `apps/web/src/modules/preflight/useAgentPreflight.js` | Encapsulates the three-piece preflight state (`result`, `status`, `blockMessage`) and the async `run(plan, recipientAddressOverride?)` call to `POST /v1/agent/preflight`. Exposes `{ result, status, blockMessage, run, reset, block }`. Replaces three separate `useState` calls in App.jsx. |
| `apps/web/src/modules/voice/useVoiceRecorder.js` | Encapsulates the full `SpeechRecognition` lifecycle: creates and auto-restarts the recognition instance, runs the recording timer, normalizes transcripts via `normalizeVoiceTranscript`, and surfaces errors inline (auto-cleared after 7 s so they don't linger when the user switches to typing). Exposes `{ isRecording, isPaused, recordingSeconds, voiceError, hasSpeechSupport, startRecording, cancelRecording, stopRecording, togglePause, clearVoiceError }`. Used by `PlanEditorScreen`. |
| `apps/web/src/components` | Reusable Choco visual components, including pitch and guided-demo visuals. |
| `apps/web/src/content/demoFlow.js` | Source of truth for pitch/demo copy and guided-demo step timing. |
| `apps/web/src/content/reviewLinks.js` | Source of truth for in-app support/about copy and public review links. |
| `apps/web/src/config/runtime.js` | Reads Vite runtime variables for API, live demo, explorer, QR, and start-screen behavior. |
| `apps/web/src/data/testnetScenario.js` | Low-value testnet plan, commands, timestamps, and sample receipt hashes. |
| `apps/web/src/modules/wallet/useMiniPayWallet.js` | MiniPay/browser wallet detection and wallet verification. Network is config-driven: `buildWalletNetwork` reads `VITE_CELO_NETWORK_KEY` (mainnet since Block 13) and falls back to `celoSepolia` when unset (node unit tests). |
| `apps/web/src/modules/wallet/useMiniPayWallet.test.js` | Protects the Celo Sepolia fallback chain ID used by wallet verification when no env override is set. |
| `packages/core` | Shared intent parsing, duplicate detection, receipt, amount, and Celo config logic. |
| `packages/core/src/config/celo.js` | Source of truth for Celo network IDs, RPC URLs, explorers, native currency, and stablecoin fee-currency addresses. |
| `packages/core/src/domain/contacts.js` | Contact schema `{ alias, walletAddress, network }`, `isValidWalletAddress` (0x regex), `buildContact`, `formatContactShort`. Used by `useContacts.js` and imported by `App.jsx` for the `ContactCapture` input validator. |
| `packages/core/src/domain/preflight.js` | Choco Agent AI readiness rules for Celo Sepolia gas funds and recipient wallet address. Block 11: "recipient contact" check now requires a valid `0x...` address, not just an alias string. |
| `packages/core/src/domain/preflight.test.js` | Protects agent readiness behavior before wiring real transfer execution. |
| `services/api` | Backend API shell for quotes, identity, and transfer orchestration. |
| `services/worker` | Scheduler and reconciliation shell for recurring transfers. |
| `contracts/src/RemittanceScheduler.sol` | Draft on-chain recurring remittance scheduler: payer grants a USDC allowance and creates a schedule; a permissionless keeper calls `executeDue`, which pulls the USDC, swaps USDC → USDm → cKES via the Mento Broker with keeper-supplied slippage floors, and sends cKES to the recipient. Unaudited; not yet deployed. |
| `scripts/probe-mento.mjs` | Throwaway mainnet probe (run with `node scripts/probe-mento.mjs`) that verified the Mento V2 route on 2026-06-10: token metadata, exchange providers, USDC/USDm and USDm/cKES exchange IDs, hop-2 quotes, and V3 USDC/USDm pool depth. Source of the verified `celoMainnet` addresses in `celo.js`. |
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
| `.env` | Non-secret environment contract for local and deployed services. |
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

## Planned Refactors (before Block 15 / mainnet)

These are not blocking any current block but should be completed before the codebase is handed to a larger team or opened to external contributors.

| Refactor | File | Why | Status |
| --- | --- | --- | --- |
| Extract screen components | `apps/web/src/App.jsx` → `apps/web/src/screens/` + `apps/web/src/utils/planUtils.js` | Single Responsibility. Each screen is its own file. `App.jsx` becomes a ~350-line router. Pure helpers live in `planUtils.js`. | **Done** |
| Consolidate duplicate detection | `packages/core/src/domain/duplicates.js` | `planSignature` now handles both intent-shape (`recipientAlias`, `amountMinor`) and plan-shape (`recipient`, `amount`) via `??` fallbacks. `buildPlanFromIntent` preserves raw intent fields (`amountMinor`, `cadence`, `dayLabel`) on every committed plan so worker and frontend produce identical signatures. Block 14 prerequisite met. | **Done** |
| `contactStore` file-backed persistence | `services/api/src/server.js` | Replaced in-memory `Map` with a JSON file store (`services/api/contacts.json`). Contacts survive server restarts. Block 14 prerequisite met. | **Done** |
| DEV debug logging | `apps/web/src/App.jsx` | Added `import.meta.env.DEV` guard for `console.debug` logging the `resolvedPreviewPlan` vs `previewPlan` resolution path on every render. | **Done** |
| Extract voice recorder hook | `apps/web/src/modules/voice/useVoiceRecorder.js` | SpeechRecognition lifecycle (120+ lines) extracted from `PlanEditorScreen` into a standalone hook. `PlanEditorScreen` uses `useVoiceRecorder({ onTranscript })` and calls `stopRecording()` before `onBuild`. Hook is independently importable and testable. | **Done** |
| Replace three-piece preflight state | `apps/web/src/modules/preflight/useAgentPreflight.js` | `agentPreflight`, `agentPreflightStatus`, `transferBlockMessage` collapsed into `useAgentPreflight({ wallet, getContact, apiBaseUrl })` returning `{ result, status, blockMessage, run, reset, block }`. `App.jsx` now has 11 useState instead of 14. | **Done** |
| Move demo/processing timer state down | `apps/web/src/screens/DemoTourScreen.jsx`, `apps/web/src/screens/ProcessingScreen.jsx` | `demoStep`, `demoElapsedSeconds`, and their 3 App effects moved to `DemoTourScreen` local state. `runStep` and its App effect moved to `ProcessingScreen`. Both use a `useRef` pattern to hold the latest `onFinish`/`onComplete` callback without resetting timers on re-renders. App root no longer re-renders every second during demos or processing. | **Done** |
| `isValidWalletAddress` canonical source | `packages/core/src/domain/contacts.js` | Single source. `useMiniPayWallet.js` re-exports it. Previously duplicated with slightly different trim behavior. | **Done** |
| `normalizeVoiceTranscript` canonical source | `apps/web/src/modules/voice/voiceNormalize.js` | Single source. Imported by `PlanEditorScreen`. Tested. Previously an untestable inline function. | **Done** |

## Finish Before Release

- Replace draft legal/support/stats pages with approved production content.
- Connect the support form to the final chat, inbox, or ticket endpoint.
- Confirm the final agent metadata URL, owner wallet, and ERC-8004 registration evidence.
- Connect quote, ODIS, transfer, notification, analytics, and monitoring providers through the existing module boundaries.
- Validate MiniPay behavior at 360 x 640.
