# Production File Review

This repository should stay focused on the production MiniPay app. Keep source, Docker, ops, and review assets here; keep the static MVP in `choco`.

## Keep

| Path | Why it belongs in production |
| --- | --- |
| `.github/workflows/ci.yml` | Runs production checks on push and pull requests. |
| `apps/web` | MiniPay-facing web app shell. |
| `apps/web/src/App.jsx` | Root app state, screen routing, wallet guard, and the async `buildPlan` flow: POSTs to `/v1/intent/preview`, stores the resolved plan in `resolvedPreviewPlan`, then triggers preflight. Owns `PlanEditorScreen` (voice input), `ContactCapture` (recipient wallet prompt), and `ReviewScreen` (contact-resolved route card + wallet check). |
| `apps/web/src/modules/contacts/useContacts.js` | `localStorage` CRUD hook for Block 11 contacts. `getContact(alias)` returns a stored `{ alias, walletAddress, network }` record or null. `saveContact(alias, walletAddress)` validates and persists. App.jsx calls `saveContactAndSync` to also mirror to `POST /v1/contacts`. |
| `apps/web/src/components` | Reusable Choco visual components, including pitch and guided-demo visuals. |
| `apps/web/src/content/demoFlow.js` | Source of truth for pitch/demo copy and guided-demo step timing. |
| `apps/web/src/content/reviewLinks.js` | Source of truth for in-app support/about copy and public review links. |
| `apps/web/src/config/runtime.js` | Reads Vite runtime variables for API, live demo, explorer, QR, and start-screen behavior. |
| `apps/web/src/data/testnetScenario.js` | Low-value testnet plan, commands, timestamps, and sample receipt hashes. |
| `apps/web/src/modules/wallet/useMiniPayWallet.js` | MiniPay/browser wallet detection and Celo Sepolia testnet verification. |
| `apps/web/src/modules/wallet/useMiniPayWallet.test.js` | Protects the Celo Sepolia testnet chain ID used by wallet verification. |
| `packages/core` | Shared intent parsing, duplicate detection, receipt, amount, and Celo config logic. |
| `packages/core/src/config/celo.js` | Source of truth for Celo network IDs, RPC URLs, explorers, native currency, and stablecoin fee-currency addresses. |
| `packages/core/src/domain/contacts.js` | Contact schema `{ alias, walletAddress, network }`, `isValidWalletAddress` (0x regex), `buildContact`, `formatContactShort`. Used by `useContacts.js` and imported by `App.jsx` for the `ContactCapture` input validator. |
| `packages/core/src/domain/preflight.js` | Choco Agent AI readiness rules for Celo Sepolia gas funds and recipient wallet address. Block 11: "recipient contact" check now requires a valid `0x...` address, not just an alias string. |
| `packages/core/src/domain/preflight.test.js` | Protects agent readiness behavior before wiring real transfer execution. |
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

| Refactor | File | Why |
| --- | --- | --- |
| Extract screen components | `apps/web/src/App.jsx` (1,900 lines) → `apps/web/src/screens/` | Single Responsibility. Each screen (`PlanEditorScreen`, `ReviewScreen`, `ReceiptDetailScreen`, `WalletGateScreen`, etc.) should be its own file. `App.jsx` becomes a router that wires state to screens. |
| Extract voice recorder hook | `PlanEditorScreen` voice logic → `apps/web/src/modules/voice/useVoiceRecorder.js` | SpeechRecognition lifecycle is 120+ lines inside a screen component. Extracting it makes it independently testable and reusable. |
| Consolidate duplicate detection | `App.jsx::getPlanSignature` + `packages/core/src/domain/duplicates.js` | Two implementations with different object shapes. The worker will use `duplicates.js`; the frontend uses the App.jsx version. Must converge before Block 14 or the worker will have divergent behavior. |
| Replace three-piece preflight state | `agentPreflight`, `agentPreflightStatus`, `transferBlockMessage` → `useAgentPreflight()` hook | A tightly coupled triple that always changes together. A single hook returning `{ status, result, blockMessage, run }` reduces `App` state from 14 useState to 11 and makes the loading/error/ready cycle easier to reason about. |
| Move timer state down | `demoElapsedSeconds`, `demoStep`, `runStep`, `isRecording`/`isPaused`/`recordingSeconds` | These are currently in App and cause full-tree re-renders on every second tick. Each should live in its local screen component. |
| `isValidWalletAddress` canonical source | **Done** — `packages/core/src/domain/contacts.js` is now the single source. `useMiniPayWallet.js` re-exports it. | Previously duplicated with slightly different trim behavior. |
| `normalizeVoiceTranscript` canonical source | **Done** — `apps/web/src/modules/voice/voiceNormalize.js` is now the single source. Imported by `App.jsx`. Tested. | Previously an untestable inline function in a 1,900-line component file. |

## Finish Before Release

- Replace draft legal/support/stats pages with approved production content.
- Connect the support form to the final chat, inbox, or ticket endpoint.
- Confirm the final agent metadata URL, owner wallet, and ERC-8004 registration evidence.
- Connect quote, ODIS, transfer, notification, analytics, and monitoring providers through the existing module boundaries.
- Validate MiniPay behavior at 360 x 640.
