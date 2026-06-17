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
| Destination asset | cKES (Kenyan Shilling stablecoin) |
| Actions | Send now (exact-output) · Monthly schedule |
| Contacts | Optional Supabase persistence; ODIS/SocialConnect path documented |

## How the flow works

1. User opens Choco in MiniPay or a Celo wallet browser.
2. Choco reads on-chain balances (USDC, cKES, CELO) via `readStablecoinBalances`.
3. User types a plain-language instruction — `20k mom every 1st` → 20,000 cKES to Mum.
4. `parseTransferIntent` (intent.js) extracts recipient, amount, currency, timing.
5. `verifyReadiness` (cepolia.js) gates on wallet + USDC balance before reaching Review.
6. **Send now** — `swapAndSendExact` on ChocoGateway: caller approves `quoteExactOut(ckesExact)` USDC, gateway deducts fee, swaps USDC → USDm → cKES via Mento, delivers exactly `ckesExact` to recipient, returns surplus to sender.
7. **Schedule** — wallet approves the keeper settlement spender and `createMonthlySchedule` writes the plan to ChocoLedger.
8. Plans and movement history are re-read from ChocoLedger events — never cached off-chain.
   Future schedules stay in Plans; History shows send-now movements and executed schedule runs.

## On-chain contracts

| Contract | Purpose |
|---|---|
| **ChocoGateway** | Fee (0.25%), USDC→cKES swap, on-chain TxRecord storage, ChocoLedger.logAttemptFor |
| **ChocoLedger** | Schedule source of truth plus settlement/send-now audit events |

Env var `VITE_CKES_SWAP_CONTRACT_ADDRESS` points to the active ChocoGateway for new sends.
If multiple gateways were deployed during testing, set `VITE_CKES_SWAP_CONTRACT_ADDRESSES`
to the comma-separated active + legacy gateway list so History can rebuild every send-now
movement from chain events. See `contracts/README.md`.

## Frontend architecture

```
src/
  chain/           ← viem interaction, split by concern
    client.js      chain config, public/wallet client factories
    abis.js        ERC20, Mento Broker, Registry, ChocoGateway ABIs
    tokens.js      balances, approve, intent amount helpers
    swap.js        sendNow (exact-output + fixed-input + direct Mento)
    schedule.js    createScheduleViaRegistry, cancelScheduleViaRegistry
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
