# Choco

Choco is an AI financial agent for MiniPay that turns a text or voice instruction into a wallet-approved family transfer on Celo. A user can say "send mom 50 KESm" or "send dad 5 KESm every 1st", review the details, sign in the wallet, and get an on-chain receipt.

Choco is not a bank and does not hold private keys. Send-now transfers move only after the user signs. Scheduled plans are wallet-authorized on-chain plans; the current gateway can reserve a scheduled run so execution does not depend on the user being online later.

## Current Status

| Area | Status |
|---|---|
| Network | Celo Mainnet, chainId 42220 |
| App | MiniPay-first web app at [usechoco.app](https://usechoco.app/) |
| Demo | [usechoco.app/demo.html](https://usechoco.app/demo.html) |
| Corridor | USDC to KESm, United States to Kenya |
| Actions | Send now and monthly scheduled plans |
| Fee | 0.25% protocol fee in the gateway contract |
| Recognition | 2nd place, [Celo Colombia Hackathon](https://hackathon.celocolombia.org/resultados?token=99e4149611fb48ee8cbfe2de) |

## How Choco Works

1. User opens Choco in MiniPay or a Celo wallet browser.
2. Choco reads wallet balances from Celo Mainnet.
3. User types or speaks the transfer instruction.
4. Agent Choco extracts recipient, amount, asset, and timing.
5. The confirmation screen shows the recipient, amount, timing, fees, and total.
6. The wallet asks the user to sign.
7. ChocoGateway executes the transfer or stores the scheduled plan state on-chain.
8. ChocoLedger emits the events used to rebuild Plans, Movements, and Receipts.

## Product Rules

- Choco reads wallet funds; it does not create a Choco balance.
- The wallet is the user approval layer for every send-now transfer and every schedule authorization.
- Saved contacts are optional convenience data. Amounts, plans, and movements come from chain events.
- The user should see simple copy: recipient, amount, timing, fee, total, receipt.
- Route details stay mostly internal unless a route is unavailable or the transaction fails.
- Plans and movements must be rebuilt from ChocoLedger and gateway events, not from local UI state.

## Public Routes

| Route | Purpose |
|---|---|
| `/` | Main MiniPay app |
| `/demo.html` | Standalone demo and launch page |
| `/contact-us.html` | Public contact page with app and demo links |
| `/agent.json` | Agent metadata |
| `/privacy.html` | Privacy summary |
| `/terms.html` | Terms summary |
| `/support.html` | Support and transaction issue help |
| `/stats.html` | Lightweight public stats |

## Blockchain Contracts

Active Celo Mainnet contracts:

| Contract | Address | Deploy block | Role |
|---|---|---:|---|
| ChocoLedger | `0x15659C181f31e5A463BcaB7E2cc706B0b336967C` | 70322672 | Plan registry and event log for schedules, send-now attempts, and executed plan receipts |
| ChocoGateway | `0x900F0c07b08483e860B4055892528dAE08eE56b3` | 70322683 | USDC to USDm to KESm settlement, protocol fee, scheduled run reserve, recipient delivery, ledger logging |

Explorer links:

- ChocoLedger: [Celoscan](https://celoscan.io/address/0x15659C181f31e5A463BcaB7E2cc706B0b336967C) / [Blockscout](https://celo.blockscout.com/address/0x15659C181f31e5A463BcaB7E2cc706B0b336967C)
- ChocoGateway: [Celoscan](https://celoscan.io/address/0x900F0c07b08483e860B4055892528dAE08eE56b3) / [Blockscout](https://celo.blockscout.com/address/0x900F0c07b08483e860B4055892528dAE08eE56b3)

Historical contracts kept only for audit context and old event reads:

| Status | Contracts |
|---|---|
| Superseded pair | Ledger `0xB2f969dAbaC42A146dE231F241990a94b21e9789`, Gateway `0x8271442a1a902c69415657926FDe8ae277dD2255` |
| Pre-audit pair | Ledger `0x5A33C24eBF81fb215ee39f801D94895c8A7CE2C9`, Gateway `0xcF4DC6118482C04ac25A95742202745aE7DB193E` |
| Legacy test pair | Ledger `0xd8F54CCbc314014443DEbAA8558B09D4ccC57A9E`, Gateway `0x3003f0Fb134ED3c66Ac95A6AbE59FA3E2BA792E7` |
| Earlier gateway tests | `0xBB1ebeDf01C6Df335aA186748d9B08Df8fB6F8c8` and `0xF51E842b...` |

## Settlement Model

Send now:

```text
User wallet -> approve quoted USDC -> ChocoGateway -> KESm recipient -> ChocoLedger event
```

Scheduled plan:

```text
User wallet -> authorize plan -> ChocoLedger stores recipient/amount/timing
            -> ChocoGateway reserves or settles the scheduled run
            -> keeper triggers due run -> KESm recipient -> ChocoLedger receipt event
```

The keeper can trigger a due plan, but it cannot change the recipient or amount because those values are read from ChocoLedger.

## Developer Quick Start

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:5173`. For real signing, use MiniPay or another Celo Mainnet wallet browser.

Run checks:

```bash
npm run test
npm run build
npm run contracts:test
```

One command for the main app checks:

```bash
npm run check
```

## Required Environment

Production is blocked unless these values are correct in Vercel:

```bash
VITE_CELO_CHAIN_ID=42220
VITE_CELO_CHAIN_ID_HEX=0xa4ec
VITE_CELO_RPC_URL=https://forno.celo.org
VITE_BLOCK_EXPLORER_URL=https://celoscan.io
VITE_BLOCK_EXPLORER_TX_URL=https://celoscan.io/tx/
VITE_BLOCK_EXPLORER_API_URL=https://celo.blockscout.com/api

VITE_USDC_ADDRESS=0xcebA9300f2b948710d2653dD7B07f33A8B32118C
VITE_USDM_ADDRESS=0x765DE816845861e75A25fCA122bb6898B8B1282a
VITE_KESM_ADDRESS=0x456a3D042C0DbD3db53D5489e98dFb038553B0d0
VITE_FEE_CURRENCY_ADDRESS=0x2F25deB3848C207fc8E0c34035B3Ba7fC157602B

VITE_LEDGER_ADDRESS=0x15659C181f31e5A463BcaB7E2cc706B0b336967C
VITE_LEDGER_DEPLOY_BLOCK=70322672
VITE_CKES_SWAP_CONTRACT_ADDRESS=0x900F0c07b08483e860B4055892528dAE08eE56b3
VITE_CKES_SWAP_UNIV3_ADDRESS=0x900F0c07b08483e860B4055892528dAE08eE56b3
VITE_CKES_SWAP_DEPLOY_BLOCK=70322683
VITE_CKES_SWAP_CONTRACT_ADDRESSES=0x900F0c07b08483e860B4055892528dAE08eE56b3,0x8271442a1a902c69415657926FDe8ae277dD2255
VITE_SCHEDULE_ESCROW_ADDRESS=0x900F0c07b08483e860B4055892528dAE08eE56b3
VITE_SETTLEMENT_SPENDER_ADDRESS=0x900F0c07b08483e860B4055892528dAE08eE56b3

VITE_MENTO_BROKER_ADDRESS=0x777A8255cA72412f0d706dc03C9D1987306B4CaD
VITE_MENTO_BIPOOL_ADDRESS=0x22d9db95E6Ae61c104A7B6F6C78D7993B94ec901
VITE_MENTO_USDC_USDM_ID=0xacc988382b66ee5456086643dcfd9a5ca43dd8f428f6ef22503d8b8013bcffd7
VITE_MENTO_USDM_CKES_ID=0x89de88b8eb790de26f4649f543cb6893d93635c728ac857f0926e842fb0d298b

VITE_DEFAULT_SCHEDULE_TIME=04:00
VITE_LIVE_DEMO_URL=https://usechoco.app/demo.html
VITE_AGENT_URI=https://usechoco.app/agent.json
```

Server-only Vercel secrets:

```bash
KEEPER_KEY=0x...
CRON_SECRET=...
```

Optional contact persistence:

```bash
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

## Schedule Worker

The schedule worker is available at:

```text
/api/run-due-schedules
```

Manual production trigger:

```powershell
$headers = @{ Authorization = "Bearer $env:CRON_SECRET" }
Invoke-RestMethod -Uri "https://usechoco.app/api/run-due-schedules" -Headers $headers
```

Local dry run:

```bash
npm run settle:due
```

Local execution against mainnet:

```bash
KEEPER_KEY=0x... npm run settle:due -- --send
```

On Windows PowerShell:

```powershell
$env:KEEPER_KEY = "0x..."
npm run settle:due -- --send
```

## Contract Operations

Deploy order:

```bash
npm --prefix contracts run deploy:ledger
npm --prefix contracts run deploy:gateway
```

Authorize the gateway on the ledger:

```bash
npm run authorize:swap -- 0x900F0c07b08483e860B4055892528dAE08eE56b3
```

The deployment wallet needs CELO for network fees. The keeper wallet also needs CELO to execute due schedules.

## Architecture

```text
src/
  chain/       Celo clients, token reads, swaps, schedules, history mappers
  lib/         config, intent parsing, readiness, contacts, fees
  modules/     React hooks for wallet, ledger, transfer, contacts, voice
  screens/     full-screen UI views
  components/  reusable UI primitives
  styles/      app CSS split by surface
contracts/
  src/         ChocoGateway.sol and ChocoLedger.sol
  scripts/     deploy, verify, authorize, and check helpers
api/           Vercel worker endpoint for due schedules
public/        static public pages, agent metadata, demo, SEO files
```

## Security

See [SECURITY.md](SECURITY.md) for disclosure rules and scope. See [contracts/AUDIT.md](contracts/AUDIT.md) for the current audit notes and known tradeoffs.

Important security assumptions:

- ChocoLedger holds no funds.
- ChocoGateway is the only settlement contract for the active deployment.
- The keeper can execute due plans but cannot change the recipient or amount.
- The frontend must never ask for private keys.
- `.env`, `.env.local`, and server-only secrets must not be committed.

## Documentation Policy

README is the source of truth for product flow, deployment, and active contracts. The files in `docs/` are intentionally short pointers to this README so production instructions do not drift.
