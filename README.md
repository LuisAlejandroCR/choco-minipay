# Choco

Choco is a MiniPay-native remittance agent for one narrow Celo Mainnet flow:

`send my mum 50k every 1st of the month`

The app connects to the user's wallet, reads stablecoin balances, parses a plain-language
instruction, and asks the wallet to sign the selected action. Choco does not custody funds or
private keys. All transaction history is derived from on-chain events; nothing is stored
off-chain except contacts the user explicitly saves.

## Corridor

| Field | Value |
|---|---|
| Network | Celo Mainnet (chainId 42220) |
| Source asset | USDC |
| Destination asset | KESm (Kenyan Shilling stablecoin) |
| Actions | Send now (exact-output) · Monthly schedule |
| Contacts | Optional Supabase persistence; ODIS/SocialConnect path documented |

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
| ChocoLedger | `0x5A33C24eBF81fb215ee39f801D94895c8A7CE2C9` | Plan registry and unified event log for send-now attempts, schedule creation, and executed plan receipts | ✅ Verified on Blockscout (block 70235501) |
| ChocoGateway | `0xcF4DC6118482C04ac25A95742202745aE7DB193E` | USDC→USDm via Mento, then USDm→KESm via Uniswap V3; held funds for scheduled plans (`fundRun`/`settleScheduledRun`), protocol fee, recipient delivery, and ledger logging | Verification pending — source + constructor args confirmed (block 70235509) |

> **Superseded (dormant):** old ledger `0xd8F54CCbc314014443DEbAA8558B09D4ccC57A9E` + old gateway `0x3003f0Fb134ED3c66Ac95A6AbE59FA3E2BA792E7` — that pair had an incompatible 12-vs-13-field schedule struct that broke scheduled settlement — plus earlier gateways `0xBB1ebeDf…` / `0xF51E842b…`. The live pair is the verified ledger `0x5A33C24e…` + gateway `0xcF4DC6…`.

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
VITE_LEDGER_ADDRESS=0x5A33C24eBF81fb215ee39f801D94895c8A7CE2C9
VITE_LEDGER_DEPLOY_BLOCK=70235501
# All four gateway/escrow/settlement vars point at the ONE live ChocoGateway:
VITE_CKES_SWAP_CONTRACT_ADDRESS=0xcF4DC6118482C04ac25A95742202745aE7DB193E
VITE_CKES_SWAP_UNIV3_ADDRESS=0xcF4DC6118482C04ac25A95742202745aE7DB193E
VITE_CKES_SWAP_DEPLOY_BLOCK=70235509
VITE_CKES_SWAP_CONTRACT_ADDRESSES=0xcF4DC6118482C04ac25A95742202745aE7DB193E
VITE_SCHEDULE_ESCROW_ADDRESS=0xcF4DC6118482C04ac25A95742202745aE7DB193E
VITE_SETTLEMENT_SPENDER_ADDRESS=0xcF4DC6118482C04ac25A95742202745aE7DB193E
VITE_FEE_CURRENCY_ADDRESS=0x2F25deB3848C207fc8E0c34035B3Ba7fC157602B
```

### Verification note

**ChocoGateway is source-verified on Blockscout.** ChocoLedger deployed from an uncommitted source
revision, so its exact bytes are not in git and a full-match verify is not possible (it holds no
funds — it is the event log; a partial/Sourcify match or re-verify on its next redeploy is the path).
Both contracts are single self-contained `.sol` files compiled with **solc 0.8.26, optimizer enabled
(200 runs), default evmVersion**. To (re)verify via Blockscout's Etherscan-compatible API or the UI:

**Hardhat → Celoscan** (needs a free key in `CELOSCAN_API_KEY`), from `contracts/`:

```bash
npx hardhat verify --network celo --constructor-args verify-gateway-args.cjs \
  0x3003f0Fb134ED3c66Ac95A6AbE59FA3E2BA792E7
npx hardhat verify --network celo \
  0xd8F54CCbc314014443DEbAA8558B09D4ccC57A9E 0xCAA38B341d421E1D3e6F5a9F011130B7cB0AA80F
```

**Blockscout** (no key): open each address → *Contract → Verify & Publish → Solidity (single file)*,
paste `contracts/src/ChocoGateway.sol` / `ChocoLedger.sol`, select compiler `v0.8.26` + optimizer/200,
and paste the ABI-encoded constructor args (gateway args are in `contracts/verify-gateway-args.cjs`;
ledger arg is the keeper `0xCAA38B341d421E1D3e6F5a9F011130B7cB0AA80F`).
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

## Docs

| File | What it covers |
|---|---|
| `contracts/README.md` | ChocoGateway + ChocoLedger developer reference, deploy order, events |
| `docs/deployment.md` | Full Vercel deploy checklist with all env vars |
| `docs/agent-flow.md` | Transfer flow, component responsibilities, on-chain vs off-chain data |
| `docs/checklist.md` | Historical architecture decisions and current state |
