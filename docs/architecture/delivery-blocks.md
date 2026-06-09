# Delivery Blocks

This file is the working rhythm for Choco production. Instead of trying to finish the whole app at once, we close one block at a time: define the goal, touch the smallest useful set of files, validate the result, update the docs, and commit the work.

The table below shows what is already complete and why it counts as complete. The next-block sections show where to continue without mixing stages or losing context. When a block is done, move it into `Completed`, add the evidence, and keep the next block focused.

Use `docs/architecture/architecture.md` when you need to understand how the app is built or where to debug a problem. Use this file when you need to decide what block to close next.

## Product Corridor

**One corridor, one channel, one scheduled action.**

> Diaspora user says "send my mum 50k KES every 1st of the month." Agent reads their USDC balance, quotes USDC → cKES via Mento, confirms with the user, executes the swap and transfer on Celo, retries on failure, notifies the recipient, and files a receipt.

- **Target users:** EM retail + diaspora (US → Kenya primary corridor)
- **Channel:** MiniPay wallet chat / web app (WhatsApp / Telegram future)
- **On-chain:** USDC → cKES swap via Mento AMM (CIP-64 fee abstraction)
- **Off-ramp path (future):** Kotani Pay → M-Pesa / mobile money
- **Why it wins:** 0.1% stablecoin fee vs 3.5% card rails. Agent removes the last friction: scheduling and recipient UX.
- **Stage:** Celo Sepolia testnet throughout blocks 11–14. Mainnet in block 15.

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
| 10. API Contracts | Text and voice commands route through `POST /v1/intent/preview`. API intent drives `buildPlanFromIntent` and the committed plan. Voice uses `SpeechRecognition` with auto-restart on Safari silence timeout and KES homophone normalization. `POST /v1/agent/preflight` returns four checks. Edit-plan back button fixed. x402 (pay-per-request) and Whisper (voice transcription fallback) were scoped but **not implemented** — both are future development, see Block 15. | `apps/web/src/App.jsx`, `services/api/src/server.js`, `docs/architecture/architecture.md` |
| 11. Recipient Contact | Preflight now requires a real `0x` Celo Sepolia wallet address for the recipient (not just an alias). Review screen shows `ContactCapture` when the recipient has no linked address — user pastes a `0x...` address, optionally saves it under the alias (e.g. "Mom"). Saved contacts persist in `localStorage` and sync to `POST /v1/contacts` so the worker can read them. Receipt shows alias + truncated address. Route card shows `Mom · 0xAb12...ef34` once resolved. | `packages/core/src/domain/contacts.js`, `apps/web/src/modules/contacts/useContacts.js`, `packages/core/src/domain/preflight.js`, `services/api/src/server.js`, `apps/web/src/App.jsx`, `apps/web/src/styles.css` |

## Current Block

Block: 12. Balance + Quote

Goal: Read the sender's actual USDC balance from the connected wallet. Fetch the live USDC → cKES conversion rate from Mento. Show the user exactly what they have and what the recipient gets before confirming.

## Next Blocks

### 12. Balance + Quote

Goal: Read the sender's actual USDC balance from the connected wallet. Fetch the live USDC → cKES conversion rate from Mento. Show the user exactly what they have and what the recipient gets before confirming.

The UX: "You have $2.10 USDC — sending 271 cKES to Mom (0xAb12...ef34)."

**Pre-block decision (required before writing any code):**
Check `https://celo-sepolia.blockscout.com` for cKES ERC-20 and the Mento broker contract.
- If cKES **exists** on Celo Sepolia: use it as `destinationAsset`. Fill in `cKesAddress` and `mentoBrokerAddress` in `packages/core/src/config/celo.js`.
- If cKES **does not exist**: use USDm (`0xdE9e4C3ce781b4bA68120d6261cbad65ce0aB00b`) as `destinationAsset` for blocks 12–13. Update `testnetScenario.js` accordingly. Document the substitution clearly.
This decision gates the block — do not start implementation until it is resolved.

Files:

- `packages/core/src/domain/quote.js` (new — Mento rate fetch, USDC balance read)
- `services/api/src/server.js` (add `POST /v1/quote`)
- `apps/web/src/App.jsx` (balance + quote in review screen)
- `packages/core/src/config/celo.js` (fill in `cKesAddress` and `mentoBrokerAddress` once confirmed)

Notes:

- USDC balance: `eth_call` to `balanceOf(walletAddress)` on the USDC ERC-20 contract (`0x01C5C...` on Sepolia).
- Mento rate: query the Mento broker or use a mock oracle for testnet.
- A second check ("USDC balance") should be added to `packages/core/src/domain/preflight.js` in this block. The existing four checks become five.

Validation:

- `POST /v1/quote` returns `{ sourceAsset, sourceAmount, destinationAsset, destinationAmount, rate, expiresInSeconds }`.
- Review screen shows real available balance and what the recipient receives.
- If USDC balance < required amount, preflight blocks with a specific "insufficient balance" message.
- Rate is live (not hardcoded). `cKesAddress` or `mentoBrokerAddress` being `null` in `celo.js` must cause the block to throw with a clear setup message, not silently use a wrong value.

### 13. Transfer Execution

Goal: Execute the actual USDC → cKES swap and send on Celo Sepolia testnet. File a real transaction receipt with a real Blockscout hash. "Send now" becomes a real on-chain action.

The flow: Choco builds a CIP-64 transaction (feeCurrency = USDC adapter), calls Mento broker to swap USDC for cKES, sends cKES to the recipient wallet address. Signs using the connected MiniPay wallet.

Files:

- `packages/core/src/domain/transfer.js` (new — transaction builder, Mento swap calldata)
- `services/api/src/server.js` (add `POST /v1/transfer/prepare` — builds unsigned tx for wallet signing)
- `apps/web/src/App.jsx` (wire "Confirm schedule" / "Prepare testnet send" to real tx)
- `apps/web/src/modules/wallet/useMiniPayWallet.js` (add `signAndSend(tx)` method)

Notes:

- The API prepares and validates the transaction; the wallet signs it. The API never holds private keys.
- Mento broker address on Celo Sepolia needs to be confirmed before this block starts.
- CIP-64 fee abstraction: if USDC fee-currency adapter is not whitelisted on Sepolia, fall back to native CELO gas.

Validation:

- `POST /v1/transfer/prepare` returns an unsigned transaction object.
- MiniPay wallet signs and broadcasts; Choco receives the tx hash.
- Receipt shows real hash verifiable on `https://celo-sepolia.blockscout.com/tx/<hash>`.
- QR code on receipt points to real Blockscout tx.

### 14. Worker + Scheduling

Goal: Wire the scheduler worker to execute pending recurring transfers on schedule. Handle retries. Notify the recipient after each transfer.

**Pre-block requirement — contact store persistence:**
`contactStore` in `services/api/src/server.js` is currently an in-memory `Map`. It is wiped on every server restart. Before the worker can use it reliably, it must be persisted to a JSON file or SQLite. This is a hard prerequisite for Block 14: if the server restarts between scheduling a transfer and its execution date, the worker will find an empty contact store and silently fail to resolve the recipient address.
Required action before starting Block 14: replace the in-memory Map with a file-backed store (`node:fs` JSON or `better-sqlite3`). The Block 14 validation criteria must include a server-restart test.

**Pre-block requirement — duplicate detection shape:**
`packages/core/src/domain/duplicates.js` operates on `intent`-shaped objects (`recipientAlias`, `amountMinor`). `App.jsx` uses a parallel implementation (`getPlanSignature`, `findSimilarPlan`) operating on `plan`-shaped objects. These will diverge when the worker checks for duplicates. Before Block 14, reconcile both to use the same shape — the canonical check should live in `packages/core/src/domain/duplicates.js` and `App.jsx` should translate to it.

Files:

- `services/worker/src/scheduler.js`
- `packages/core/src/domain/duplicates.js` (reconcile with App.jsx duplicate check)
- `services/api/src/server.js` (add schedule store + persisted contact store)
- `.env`

Validation:

- Worker polls the schedule store and fires transfers on the correct day.
- Failed transfers retry up to 3 times with exponential backoff.
- Recipient is notified (testnet: log only; future: SMS via Kotani or push notification).
- Worker dry-run mode logs intended actions without sending.
- **Server restart test**: stop the API, restart it, confirm the worker can still resolve recipient addresses and scheduled transfers.

### 15. Mainnet + Channels (Future)

Goal: Move from Celo Sepolia to Celo Mainnet. Add WhatsApp / Telegram as input channels. Wire Kotani Pay for mobile money off-ramp to M-Pesa.

Notes:

- Requires production approval, KYC/AML review, and Mento mainnet liquidity verification.
- Kotani Pay API handles cKES → M-Pesa conversion for recipients without a crypto wallet.
- UK → NGN corridor is the second target (cNGN via Mento; off-ramp via Yellow Card).
- ERC-8004 Reputation Registry integration — agent builds on-chain trust score across transfers.
- IPFS-pinned agent.json + `setAgentURI(309, "ipfs://...")` for ERC-8004 compliance before mainnet registration.
- ODIS / SocialConnect: phone number → wallet address lookup on Celo. Lets recipients use a phone number instead of a wallet address. Required for non-crypto-native recipients.

**Future Development (not yet implemented — do not start before Block 15):**

- **x402 pay-per-request**: HTTP 402 middleware on the API so third-party agents pay per `/v1/intent/preview` or `/v1/quote` call in USDC. Not needed for Choco's own frontend or worker (same owner). Relevant when the API is opened to external ERC-8004 agents. Reference: `https://portal.thirdweb.com/x402`.
- **Whisper voice transcription fallback**: `services/transcriber/` Python FastAPI service loading the local `whisper-base` model. Fallback for environments where `SpeechRecognition` is unavailable (non-Chrome, offline). Add `initial_prompt` with financial vocabulary ("USDC, KES, cKES, MiniPay, every 1st") to improve accuracy. Use `POST /v1/voice/transcribe` as the API endpoint.

Validation:

- First live USDC → cKES transfer on Celo Mainnet with a real recipient.
- Kotani off-ramp confirmed for at least one test recipient.

## Block Rules

- Finish one block before starting the next.
- Keep MVP-only files in `choco`, not in this production repo.
- Update this file when a block moves to completed.
- Commit each block with a clear message.
- Record validation commands in the final note for the block.
- Testnet throughout blocks 11–14. No mainnet keys, no real funds, no production KYC until block 15.
