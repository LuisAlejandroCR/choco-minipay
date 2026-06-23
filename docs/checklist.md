# Mainnet Deployment Checklist

> **Current state (June 2026):** ChocoLedger `0x15659C181f31e5A463BcaB7E2cc706B0b336967C` (block 70322672) + ChocoGateway `0x900F0c07b08483e860B4055892528dAE08eE56b3` (block 70322683) are the active Celo Mainnet pair. Vercel
> env vars up to date. Frontend split into feature hooks (`useTransfer`, `useContactResolution`)
> and chain modules (`src/chain/`). Exact-output swap (`swapAndSendExact`) live.
> Historical architecture blocks below are preserved for context.

---

This is the deployable system (`Choco for Minipay`). The reference repo (`Choco Minipay`) is a
behavior benchmark only. What follows is what changed in this repo and what is still an on-chain step.

Decisions taken for this pass:

- **ERC-8004 identity**: fresh Celo Mainnet registration (new `agentId`), metadata points to production URL (`usechoco.app`).
- **Settlement**: direct Mento Broker for USDC, no custom router — one Choco contract only.
- **URLs**: production at `usechoco.app`; lightweight Choco app preview at `usechoco.app/demo.html`.

---

## BLOCK 1 — ERC-8004 agentId / agentURI

**Done (code):**

- `public/agent.json` rewritten for mainnet: real description, `image` + `web`/`OASF` endpoints on
  `https://usechoco.app`, no `choco.example` / `TODO` placeholders.
- Config slots added: `VITE_AGENT_REGISTRY_ADDRESS` (fixed mainnet `0x8004A169…`), `VITE_AGENT_URI`,
  `VITE_AGENT_ID`, `VITE_AGENT_OWNER_ADDRESS`, `VITE_AGENT_EXPLORER_URL` (`src/lib/app-config.js`, `.env.example`).
- `scripts/register-agent.mjs` + `npm run register:agent` added (one-shot ops script, no new contract).

**On-chain step (you run it):**

1. Finalize `public/agent.json` and deploy to production (`usechoco.app`) so `/agent.json` returns 200.
2. In Vercel production environment variables, set:
   ```
   VITE_LIVE_DEMO_URL=https://usechoco.app/demo.html
   VITE_AGENT_URI=https://usechoco.app/agent.json
   ```
3. `node --env-file=.env scripts/register-agent.mjs` with a funded mainnet key. It mints the agent,
   prints the new `agentId`, and writes `ops/agent.mainnet.json`.
4. Set `VITE_AGENT_ID` + `VITE_AGENT_OWNER_ADDRESS` from the result, redeploy.
5. (Compliance) Pin `agent.json` + icon to IPFS, then `setAgentURI(agentId, "ipfs://…")`.

> Note: `agentId` is a per-chain ERC-721 tokenId. Sepolia #309 cannot move to mainnet — mainnet gets a new id.

## BLOCK 2 — Fake QR → real QR

- `src/components/QrCode.jsx` now renders a real scannable code via the `qrcode` library
  (added to `package.json`). It encodes the explorer URL, so a phone camera opens the receipt.
- Still gated to mined `0x…` hashes only (`ReceiptDetailScreen`), so no QR is shown for unsigned actions.
- Requires `npm install` to pull `qrcode`.

## BLOCK 3 — One contract, settled as Choco

- The only Choco contract is `contracts/src/ChocoScheduleRegistry.sol`. The phantom `swapAndSend`
  router (source lived only in the reference repo) is removed from the frontend.
- `src/lib/celo.js`: USDC settles **USDC → USDm → KESm through the Mento Broker** (`getAmountOut` quote
  + two `swapIn` hops + KESm transfer to recipient), each hop wallet-signed. KESm sends go direct.
- Flow preserved end to end: reads wallet funds → Agent Choco detects intent → transfer summary
  (`ReviewScreen`) → recipient address pasted (`ContactCapture`) → wallet signs.
- Scheduling approves the **keeper/executor spender** (`VITE_SETTLEMENT_SPENDER_ADDRESS`) and records
  the authorized plan on-chain. The executor must run due plans automatically and call
  `recordSettlement` so every completed plan run becomes a ChocoLedger transaction record.

## BLOCK 4 — History & plans live on-chain (Choco stores nothing)

- **Choco does not store any user data.** All plans and transaction history are derived from blockchain events.
- `src/lib/celo.js` `readOwnerLedger(owner)` reads `MonthlyScheduleCreated`, `SchedulePaused`,
  `ScheduleResumed`, `ScheduleCancelled`, and `SettlementReceipt` events. Created schedules rebuild
  Plans; only settled runs rebuild movements.
  New hook `useChocoLedger` feeds the UI.
- `App.jsx` no longer keeps `plans`/`transactions` in React state. Deleting a plan now calls
  `cancelSchedule` on-chain and re-reads. The only transient is the receipt for the just-signed action.
- Chain-derived plans show the recipient **address** (aliases like "Mum" are off-chain UI sugar; the chain
  stores addresses). Set `VITE_REGISTRY_DEPLOY_BLOCK` so event reads start at the deploy block (forno
  rejects unbounded ranges). Until the registry is deployed, lists are simply empty.

## BLOCK 5 — chainId

- The app is already mainnet-only: `chainId 42220` / `0xa4ec`, `isTestnet:false`, and `connectInjectedWallet`
  forces a mainnet switch. No testnet leakage in app code.
- The only thing that was on testnet was the **identity** (#309 on Sepolia). Block 1 moves it to mainnet.

## BLOCK 6 — Wallet contacts (advice)

Important: the **Web Contacts API** (`navigator.contacts.select`) returns name/phone/email — **not** a Celo
wallet address. It is also Android-Chrome/MiniPay only and requires HTTPS + a user gesture. So contacts
alone cannot produce a recipient address.

Recommended path:

1. Keep the manual address paste (`ContactCapture`) as the reliable fallback (already wired).
2. To go phone → address, resolve through **Celo SocialConnect / ODIS** + `FederatedAttestations` on
   mainnet (see `docs/contact-resolution.md`). The contact's phone is hashed via ODIS, then looked up in
   `FederatedAttestations` to get the wallet address. Use it only for the current transfer; do not store it.
3. MiniPay surfaces its own contact/recipient picker to mini-apps — prefer that when available, then run
   the same SocialConnect resolution on the returned identifier.

## BLOCK 7 — Git migration (advice)

The working tree is correct. To migrate the active repo without losing the deployable state:

```bash
git add .
git commit -m "Build Choco MiniPay remittance agent"
git branch -M main
git remote add origin https://github.com/LuisAlejandroCR/choco.git   # matches package.json
git push -u origin main
```

Keep this as the single deployment source of truth; never blind-merge the reference repo.

## BLOCK 8 — ERC-8004 compliance

- **Code: PASS.** Metadata is placeholder-free, registry/registration tooling is in place, identity is
  mainnet-shaped.
- **On-chain: PENDING** until `register:agent` runs and `VITE_AGENT_ID`/owner are set. Full compliance
  (content-addressed `agentURI`) needs the IPFS pin + `setAgentURI`.

## BLOCK 9 — MiniPay readiness

- **PASS (code)**: MiniPay detection, forced mainnet, USDC fee-currency adapter, wallet-only signing,
  no backend/custody, KESm + USDC (via Mento) supported, real QR, chain-derived history.
- **Config gate**: deploy the registry + set `VITE_REGISTRY_ADDRESS`, `VITE_REGISTRY_DEPLOY_BLOCK`,
  `VITE_SETTLEMENT_SPENDER_ADDRESS`. Run `npm install` (qrcode). Test at 360×640 in MiniPay.

## BLOCK 10 — Deployment risk

**MEDIUM** — down from HIGH. No fake QR, no phantom contract, no off-chain plan storage, placeholder-free
identity. Remaining gates are deploy/config + the on-chain registration, all checklisted above. Do not
flip to mainnet deploy until the registry is live and the agent is registered.

## BLOCK 11 — Unified Choco Agent flow (replaces the previous "Receipt payments" branch)

The earlier 9-step `usdc_to_ckes_receipt_payment` skill was collapsed into the standard New Transfer
flow. Pay Receipt button + dedicated screen + 9-step orchestrator are removed. See
`docs/agent-flow.md` for the canonical description.

- **Supabase**: contacts-only (`supabase/schema.sql`, table `contacts`), **stored only with prior user authorization**. Choco does not store user data — contacts are saved only when the user explicitly grants permission. The previous `receipts` and `transactions` tables are dropped.
- **Audit contract**: `ChocoAuditLog.sol` records only on-chain attempts (`SUCCESS`, `FAILED_SWAP`, `FAILED_TRANSFER`). Pre-flight UX states like insufficient funds or user rejection are NOT logged — they live as Cepolia Skill messages, no extra signatures. The contract enum still supports `INSUFFICIENT_FUNDS` and `REJECTED` for forward-compatibility, but the frontend never calls those kinds.
- **Swap contract**: `ChocoCkesSwap.sol` is used by Cepolia Skill for the live quote; `sendNow` in the frontend still runs Mento directly (1 contract, no custody).
- **History**: derived from `ChocoCkesSwap.UsdcToCkesSwap` + KESm `Transfer` events with contact labels joined in.
- **Cepolia Skill**: `src/lib/cepolia.js` supplies Recipient receives / Wallet pays / Network fee / Total cost on the Confirm Send screen.

The original BLOCK 10 "one contract / no backend / blockchain is source of truth" rules are now
partly back in force: Supabase is reduced to contacts and on-chain remains the truth for amounts
and history. The audit contract is intentionally additive, not the source of truth.

### Pre-deploy checklist

- [ ] `npm install` (pulls `qrcode`)
- [ ] `npm run check` (tests + build) and `npm run contracts:test`
- [ ] Deploy `ChocoScheduleRegistry`; set `VITE_REGISTRY_ADDRESS` + `VITE_REGISTRY_DEPLOY_BLOCK`
- [ ] Set `VITE_SETTLEMENT_SPENDER_ADDRESS` (keeper/executor spender)
- [ ] Deploy site so `/agent.json` returns 200; run `npm run register:agent`; set `VITE_AGENT_ID` + owner
- [ ] (Compliance) pin `agent.json` to IPFS + `setAgentURI`
- [ ] Verify a real send-now + a real authorized schedule on a phone in MiniPay
- [ ] Verify the keeper/executor runs a due plan and emits `SettlementReceipt`
- [ ] Choco Agent flow: deploy `ChocoCkesSwap` + `ChocoAuditLog`; apply `supabase/schema.sql`; set `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_CKES_SWAP_CONTRACT_ADDRESS`, `VITE_AUDIT_CONTRACT_ADDRESS`; end-to-end test New Transfer (USDC and KESm paths) on a phone in MiniPay
