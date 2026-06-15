# Deployment Guide

## URLs

| Environment | URL | Purpose |
|-------------|-----|---------|
| **Demo** | `https://choco-azure.vercel.app/` | Testing, development, default in code |
| **Production** | `choco-minipay.vercel.app` | Live mainnet deployment |

All files in this repo default to **demo URLs** (`choco-azure.vercel.app`). Production overrides these via environment variables.

## Local Development

```powershell
npm install
npm run dev
```

Opens `http://127.0.0.1:5173` with demo config (points to `choco-azure.vercel.app` for agent metadata).

## Production Deployment (Vercel)

### 1. Deploy contracts (mainnet)

```powershell
# Unified ledger — replaces the old ChocoScheduleRegistry + ChocoAuditLog pair
$env:DEPLOYER_PRIVATE_KEY = "0x..."
$env:KEEPER_ADDRESS = "0x..."
npm --prefix contracts run deploy:ledger

# Swap wrapper (for Cepolia live quotes)
npm --prefix contracts run deploy:swap
```

The deploy script prints `VITE_LEDGER_ADDRESS` and `VITE_LEDGER_DEPLOY_BLOCK` — note both values for step 3.

Note the deployed addresses and block numbers from Celoscan.

### 2. Supabase setup (optional)

**Supabase is only used to store contacts created by the user with prior authorization.** If you skip
this step, the app works without contact persistence (users paste addresses every time).

To enable contact storage:

1. Create project at [supabase.com](https://supabase.com)
2. SQL Editor → paste `supabase/schema.sql` → Run
3. Project Settings → API → copy URL + anon key

**Privacy note:** Choco does not store user data. Only contacts that the user explicitly authorizes
are written to Supabase. All transaction data lives on-chain.

### 3. Configure Vercel environment variables

In Vercel project settings → Environment Variables → Production:

```bash
# Production URLs (override demo defaults)
VITE_LIVE_DEMO_URL=https://choco-minipay.vercel.app/
VITE_AGENT_URI=https://choco-minipay.vercel.app/agent.json

# Celo Mainnet
VITE_CELO_CHAIN_ID=42220
VITE_CELO_CHAIN_ID_HEX=0xa4ec
VITE_CELO_RPC_URL=https://forno.celo.org
VITE_BLOCK_EXPLORER_URL=https://celoscan.io
VITE_BLOCK_EXPLORER_TX_URL=https://celoscan.io/tx/

# Fee currency adapter (USDC-as-gas, NOT the USDC token address)
VITE_FEE_CURRENCY_ADDRESS=0x2F25deB3848C207fc8E0c34035B3Ba7fC157602B

# ERC-8004 Agent (set after registration)
VITE_AGENT_REGISTRY_ADDRESS=0x8004A169FB4a3325136EB29fA0ceB6D2e539a432
VITE_AGENT_ID=
VITE_AGENT_OWNER_ADDRESS=
VITE_AGENT_EXPLORER_URL=https://8004scan.io/agents/celo

# Mento V2 — celopedia-verified mainnet addresses
VITE_MENTO_BROKER_ADDRESS=0x777A8255cA72412f0d706dc03C9D1987306B4CaD
VITE_MENTO_BIPOOL_ADDRESS=0x22d9db95E6Ae61c104A7B6F6C78D7993B94ec901
VITE_MENTO_USDC_USDM_ID=0xacc988382b66ee5456086643dcfd9a5ca43dd8f428f6ef22503d8b8013bcffd7
VITE_MENTO_USDM_CKES_ID=0x89de88b8eb790de26f4649f543cb6893d93635c728ac857f0926e842fb0d298b

# Token addresses (mainnet)
VITE_USDC_ADDRESS=0xcebA9300f2b948710d2653dD7B07f33A8B32118C
VITE_USDM_ADDRESS=0x765DE816845861e75A25fCA122bb6898B8B1282a
VITE_KESM_ADDRESS=0x456a3D042C0DbD3db53D5489e98dFb038553B0d0

# Choco contracts (from step 1)
VITE_LEDGER_ADDRESS=<ChocoLedger address printed by deploy:ledger>
VITE_LEDGER_DEPLOY_BLOCK=<block number printed by deploy:ledger>
VITE_SETTLEMENT_SPENDER_ADDRESS=<keeper EOA>
VITE_CKES_SWAP_CONTRACT_ADDRESS=<ChocoCkesSwap address>

# Supabase (from step 2, optional — leave blank to disable contact persistence)
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...

# App metadata
VITE_APP_TITLE=Choco MiniPay
VITE_APP_DESCRIPTION=Send cKES remittances from MiniPay
VITE_INITIAL_SCREEN=splash
VITE_SHOW_DEMO_PROMPT=false
```

### 4. Register ERC-8004 agent

After the production site is live at `choco-minipay.vercel.app` and serves `/agent.json`:

```powershell
# In local .env, set production URL
$env:AGENT_URI = "https://choco-minipay.vercel.app/agent.json"
$env:AGENT_PRIVATE_KEY = "0x..."  # funded mainnet key
npm run register:agent
```

This prints the new `agentId` and writes `ops/agent.mainnet.json`.

Update Vercel env vars:
```
VITE_AGENT_ID=<printed agentId>
VITE_AGENT_OWNER_ADDRESS=<your deployer address>
```

Redeploy.

### 5. (Optional) IPFS compliance

For content-addressed `agentURI`:

1. Pin `public/agent.json` + `public/icon.svg` to IPFS
2. Call `setAgentURI(agentId, "ipfs://QmXXX...")` from the owner wallet
3. Update Vercel: `VITE_AGENT_URI=ipfs://QmXXX...`

### 6. Verify

1. Open `https://choco-minipay.vercel.app` in MiniPay on Android
2. Connect wallet
3. Test send-now: `send <address> 1 USDC now` → Build → Review → Confirm
4. Test schedule: `send <address> 1000 cKES monthly` → Build → Confirm
5. Check History tab shows the movement
6. Check Celoscan for the audit log event

## Demo Deployment (choco-azure)

Demo stays on `choco-azure.vercel.app` with **default env vars** from `.env.example`. No contract addresses, no agent registration — just the UI for screenshots/testing. Supabase can be shared or separate.

## Rollback

If production breaks, revert the Vercel deployment or point `VITE_LIVE_DEMO_URL` and `VITE_AGENT_URI` back to demo (`choco-azure.vercel.app`). The on-chain state (registry, audit log, agent registration) persists independently.
