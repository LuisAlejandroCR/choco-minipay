# Choco — Cross-border remittances for MiniPay

> Type `"send mum 50k every 1st"` and Choco handles the rest — automatically, every month, without asking you to do anything again.

Choco is a MiniPay-native remittance app for the USDC→KESm corridor on Celo Mainnet. A user types a plain-language instruction, confirms once in their wallet, and the payment runs on the scheduled day — or immediately for one-time sends. No crypto knowledge required. No custody. No recurring friction.

**Why Choco?** Sending money to Kenya abroad today means logging in somewhere, entering details, paying 5–7% to a remittance service, and repeating it next month. MiniPay users already hold USDC — Choco gives them a better option:

- **0.25% fee** — up to 20× cheaper than traditional remittance services
- **Exact delivery** — recipient always receives exactly the KESm amount typed; surplus USDC returns to the sender
- **Set once, runs monthly** — a recurring plan is authorized once; the keeper executes it on the right day each month without further user action
- **Non-custodial** — funds stay in the sender's wallet until settlement day; Choco holds no keys, no custody

## Status

| | |
|---|---|
| Network | Celo Mainnet (chainId 42220) |
| Distribution | MiniPay Mini App (16M+ wallets, 66 countries) |
| Corridor | USDC → KESm (Kenyan Shilling) |
| Protocol fee | 0.25% |
| Security | Audited — see `contracts/AUDIT.md` |
| Recognition | 🥈 2nd place — [Celo Colombia Hackathon](https://hackathon.celocolombia.org/resultados?token=99e4149611fb48ee8cbfe2de) |

## Corridor

| Field | Value |
|---|---|
| Network | Celo Mainnet (chainId 42220) |
| Source asset | USDC |
| Destination asset | KESm (Kenyan Shilling stablecoin) |
| Actions | Send now (exact-output) · Monthly schedule |
| Contacts | Optional Supabase persistence; ODIS/SocialConnect path documented |

## What makes Choco different

| Differentiator | Details |
|---|---|
| **Plain-language intent** | `"send dad 20k every 1st"` → schedule created, funded, running. No address pasting, no crypto UX |
| **Recurring auto-payments** | First MiniPay Mini App with scheduled monthly remittances — authorize once, runs forever |
| **Exact-output delivery** | Recipient always receives exactly the typed KESm — no rounding, no surprises |
| **No custody** | Funds never leave the sender's wallet until the keeper settles; even the keeper cannot redirect — amounts and recipients are locked in the ChocoLedger smart contract |
| **Transparent fee** | 0.25% deducted and shown in the receipt before confirmation; no hidden FX spread |
| **Full on-chain audit trail** | Every send, plan, and settlement emits an event on ChocoLedger — history is rebuilt from the chain on every load, nothing cached off-chain |

## How the flow works

1. User opens Choco in MiniPay or a Celo wallet browser.
2. Choco reads on-chain balances (USDC, KESm, CELO) via `readStablecoinBalances`.
3. User types a plain-language instruction — `20k mom every 1st` → 20,000 KESm to Mum.
4. `parseTransferIntent` (intent.js) extracts recipient, amount, currency, timing.
5. `verifyReadiness` (cepolia.js) gates on wallet + USDC balance before reaching Review.
6. **Send now** — `swapAndSendExact` on ChocoGateway: caller approves `quoteExactOut(ckesExact)` USDC, gateway deducts fee, swaps USDC → USDm via Mento then USDm → KESm via Uniswap V3, delivers exactly `ckesExact` to recipient, returns surplus to sender as USDm.
7. **Schedule** — wallet approves the gateway and the plan is written to ChocoLedger; the gateway holds one run's USDC (`fundRun`) so the scheduled transfer can't fail on insufficient funds.
8. Plans and movement history are re-read from ChocoLedger events — never cached off-chain.
   Authorized schedules stay in Plans; History shows send-now movements and executed schedule runs.
   The keeper/executor must run due plans automatically and emit `SettlementReceipt` so every
   user-visible movement is registered on ChocoLedger.

The included Vercel worker at `/api/run-due-schedules` runs the same keeper logic as
`npm run settle:due -- --send`. It should hold only the keeper key, never user funds or user
private keys.

## Blockchain contracts

Choco uses Celo Mainnet contracts as the source of truth for sends, schedules, and receipts.
The app remains non-custodial: user funds stay in the connected wallet until a send-now action
or scheduled run is executed.

| Contract | Current address | Role | Verification status |
|---|---|---|---|
| ChocoLedger | `0x15659C181f31e5A463BcaB7E2cc706B0b336967C` | Plan registry and unified event log for send-now attempts, schedule creation, and executed plan receipts | Active on [Celoscan](https://celoscan.io/address/0x15659C181f31e5A463BcaB7E2cc706B0b336967C) + [Blockscout](https://celo.blockscout.com/address/0x15659C181f31e5A463BcaB7E2cc706B0b336967C) (block 70322672) |
| ChocoGateway | `0x900F0c07b08483e860B4055892528dAE08eE56b3` | USDC→USDm via Mento, then USDm→KESm via Uniswap V3; held funds for scheduled plans (`fundRun`/`settleScheduledRun`), protocol fee, recipient delivery, and ledger logging | Active on [Celoscan](https://celoscan.io/address/0x900F0c07b08483e860B4055892528dAE08eE56b3) + [Blockscout](https://celo.blockscout.com/address/0x900F0c07b08483e860B4055892528dAE08eE56b3) (block 70322683) |

> **Superseded (dormant):** previous verified pair ledger `0xB2f969dAbaC42A146dE231F241990a94b21e9789` + gateway `0x8271442a1a902c69415657926FDe8ae277dD2255` (blocks 70272150 / 70272159). Earlier: ledger `0x5A33C24eBF81fb215ee39f801D94895c8A7CE2C9` + gateway `0xcF4DC6118482C04ac25A95742202745aE7DB193E` (pre-audit, 13-field schedule struct). Earlier still: ledger `0xd8F54CCbc314014443DEbAA8558B09D4ccC57A9E` + gateway `0x3003f0Fb134ED3c66Ac95A6AbE59FA3E2BA792E7` (incompatible 12-vs-13-field struct that broke scheduled settlement), plus gateways `0xBB1ebeDf...` / `0xF51E842b...`.

### Contract responsibilities

`ChocoLedger` does not move funds. It records wallet-authorized plans and emits the events the
frontend reads for Plans and Movements. It also controls which gateway contracts are allowed to
write send-now attempts through `setSwapContract(address,bool)`.

`ChocoGateway` is the settlement entry point. For send-now it pulls approved USDC from the user,
collects the protocol fee, swaps `USDC -> USDm` via Mento then `USDm -> KESm` via Uniswap V3 (the
Mento USDm↔KESm oracle is unavailable, so hop 2 must use UniV3), sends KESm to the recipient, and
logs the movement to `ChocoLedger`. For scheduled plans the gateway holds one run's USDC at plan
creation (`fundRun`) and the keeper calls `settleScheduledRun` only when a plan is due — it reads the
recipient and amount from the ledger, so the keeper can trigger a run but never redirect it.

### Funds flow

```text
User wallet
  -> approve ChocoGateway for the quoted USDC amount
  -> send now or wait for scheduled execution
  -> ChocoGateway pulls USDC only at execution time
  -> fee recipient receives the protocol fee
  -> USDC -> USDm via Mento, then USDm -> KESm via Uniswap V3
  -> recipient receives KESm directly
  -> ChocoLedger records the movement event
```

For schedules, the approval and plan creation happen first, but the remittance amount is not moved
until the scheduled run. Only the wallet network fee is paid when the user authorizes the plan.

### Distribution model

The initial distribution surface is a MiniPay Mini App for one narrow corridor: USDC to KESm. The
public repo and Vercel deployment are the developer/auditor entry points, while MiniPay is the user
entry point. New corridors should be added only after this flow is stable: wallet connection,
intent parsing, contact resolution, wallet confirmation, settlement, and on-chain receipts.

Required production env vars:

```bash
VITE_LEDGER_ADDRESS=0x15659C181f31e5A463BcaB7E2cc706B0b336967C
VITE_LEDGER_DEPLOY_BLOCK=70322672
# All four gateway/escrow/settlement vars point at the ONE live ChocoGateway:
VITE_CKES_SWAP_CONTRACT_ADDRESS=0x900F0c07b08483e860B4055892528dAE08eE56b3
VITE_CKES_SWAP_UNIV3_ADDRESS=0x900F0c07b08483e860B4055892528dAE08eE56b3
VITE_CKES_SWAP_DEPLOY_BLOCK=70322683
VITE_CKES_SWAP_CONTRACT_ADDRESSES=0x900F0c07b08483e860B4055892528dAE08eE56b3,0x8271442a1a902c69415657926FDe8ae277dD2255
VITE_SCHEDULE_ESCROW_ADDRESS=0x900F0c07b08483e860B4055892528dAE08eE56b3
VITE_SETTLEMENT_SPENDER_ADDRESS=0x900F0c07b08483e860B4055892528dAE08eE56b3
VITE_FEE_CURRENCY_ADDRESS=0x2F25deB3848C207fc8E0c34035B3Ba7fC157602B
```

### Verification note

**The previous pair is source-verified on Celoscan and Blockscout; verify each new active deployment after redeploy.** Each contract is a single self-contained
`.sol` file (interfaces inline) compiled with **solc 0.8.26 (`v0.8.26+commit.8a97fa7a`), optimizer
enabled (200 runs), default evmVersion**.

The reliable method is the Etherscan-compatible `verifysourcecode` API with
**`codeformat=solidity-standard-json-input`** — single-file submission fails the metadata match
because the deployed bytecode was compiled with both files as named source units. The exact compiler
input is what `contracts/scripts/compile.cjs` produces: `sources` = `ChocoGateway.sol` +
`ChocoLedger.sol`, `settings.optimizer = { enabled: true, runs: 200 }`, no `evmVersion`.

- **Celoscan** — Etherscan **V2** API: `POST https://api.etherscan.io/v2/api?chainid=42220` (needs a
  free key in `CELOSCAN_API_KEY`; the legacy V1 `api.celoscan.io` endpoint is deprecated).
- **Blockscout** — `POST https://celo.blockscout.com/api` (no key).

Constructor args (ABI-encoded, passed as `constructorArguements`): the 12 gateway values are in
`contracts/verify-gateway-args.cjs`; the ledger's single arg is the keeper
`0xCAA38B341d421E1D3e6F5a9F011130B7cB0AA80F`.

## Public routes

| Route | Purpose |
|---|---|
| `/` | MiniPay app entry point |
| `/demo.html` | Standalone Choco demo for demos and sharing. It keeps the full archived demo page structure and updates the project cards to current Choco status, including Choco as a 2nd-place winner with the [official Celo Colombia Hackathon results](https://hackathon.celocolombia.org/resultados?token=99e4149611fb48ee8cbfe2de). |
| `/agent.json` | ERC-8004 agent metadata |
| `/privacy.html`, `/terms.html`, `/support.html`, `/stats.html` | Public support and compliance pages |
## Frontend architecture

```
src/
  chain/           ← viem interaction, split by concern
    client.js      chain config, public/wallet client factories
    abis.js        ERC20, Mento Broker, Registry, ChocoGateway ABIs
    tokens.js      balances, approve, intent amount helpers
    swap.js        sendNow (exact-output + fixed-input + direct Mento)
    schedule.js    createScheduleViaRegistry, pause/resume/cancel helpers
    history.js     readOwnerLedger (events → plans + movements)
  lib/             domain services
    celo.js        re-export barrel for src/chain/
    cepolia.js     readiness check, live quote display
    intent.js      plain-language → TransferIntent parser
    agent-choco.js agent identity + metadata
    contacts.js    Supabase contact CRUD
    supabase.js    auth helpers
    app-config.js  single runtime config hub (reads VITE_ env vars)
  modules/         React feature hooks (one concern per hook)
    wallet/        useMiniPayWallet
    ledger/        useChocoLedger   ← reads chain via history.js
    transfer/      useTransfer      ← plan build, on-chain execution, receipt
    contacts/      useContactResolution ← Supabase lookup, picker, save
    voice/         useVoiceRecorder ← SpeechRecognition (ready, not yet wired)
  screens/         full-page screen components (props-only, no chain calls)
  components/      shared UI primitives
  utils/
    planUtils.js   buildSafePreviewPlan, buildTransactionFromPlan, helpers
  App.jsx          screen router + hook wiring (~280 lines)
contracts/
  src/
    ChocoGateway.sol
    ChocoLedger.sol
```

`src/lib/celo.js` is a pure re-export barrel — all consumers import from it unchanged while
the implementation lives in the focused `src/chain/` modules.

## Run locally

```bash
npm install
npm run dev
```

Open the local URL in a browser. For signing, use MiniPay or another wallet browser on Celo
Mainnet (chainId 42220). The app forces a mainnet switch on connect.

## Validate

```bash
npm run check       # intent parser tests + vite build
npm run contracts:test
```

## Configure

Copy `.env.example` to `.env.local` and fill in:

```bash
# Choco contracts
VITE_LEDGER_ADDRESS=0x...
VITE_LEDGER_DEPLOY_BLOCK=...
VITE_SETTLEMENT_SPENDER_ADDRESS=0x...    # keeper EOA
VITE_CKES_SWAP_CONTRACT_ADDRESS=0x...   # ChocoGateway
VITE_CKES_SWAP_DEPLOY_BLOCK=...         # earliest block among configured gateways
VITE_CKES_SWAP_CONTRACT_ADDRESSES=0x...,0x...

# Mento V2 (mainnet defaults in .env.example)
VITE_MENTO_BROKER_ADDRESS=...
VITE_MENTO_BIPOOL_ADDRESS=...
VITE_MENTO_USDC_USDM_ID=...
VITE_MENTO_USDM_CKES_ID=...

# Supabase (optional — contact persistence only)
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...

# Schedules and worker
VITE_DEFAULT_SCHEDULE_TIME=04:00
KEEPER_KEY=0x...       # Vercel server-only secret
CRON_SECRET=...        # Vercel server-only secret
```

See `docs/deployment.md` for the full Vercel variable list and deploy order.

## Contacts and privacy

Choco does not store user data. Supabase is optional and is used only for contacts the user
explicitly saves. All transaction amounts and history live on-chain; the app reconstructs them
from events on every load. For production phone-to-address resolution, use ODIS/SocialConnect
(`FederatedAttestations`) — see `docs/agent-flow.md`.

## Roadmap

The USDC→KESm corridor is stable and live. Planned expansions:

| Feature | What it unlocks |
|---|---|
| **v2 contracts redeploy** | `refundRunFor` + deliver-then-transfer fallback + atomic gateway receipts — see `contracts/V2_BACKLOG.md` |
| **ODIS/SocialConnect** phone→address | `"send +254 712 345 678 20k"` — no address paste required |
| **COPm corridor** (Colombian Peso) | LATAM expansion; Colombia is Choco's home hackathon market |
| **NGNm corridor** (Nigerian Naira) | Largest MiniPay market by user count |
| **Receipt deeplink** | Share a "payment proof" URL — recipients see Choco when they receive |
| **Multi-recipient plans** | One plan splits across multiple family members |

## Docs

| File | What it covers |
|---|---|
| `contracts/README.md` | ChocoGateway + ChocoLedger developer reference, deploy order, events |
| `contracts/AUDIT.md` | Security audit findings and mitigations |
| `contracts/V2_BACKLOG.md` | Pending v2 contract changes (applied to source, awaiting redeploy) |
| `docs/deployment.md` | Full Vercel deploy checklist with all env vars |
| `docs/agent-flow.md` | Transfer flow, component responsibilities, on-chain vs off-chain data |
| `docs/checklist.md` | Historical architecture decisions and current state |
