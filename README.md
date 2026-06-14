# Choco

Choco is a MiniPay-native remittance agent for one narrow Celo Mainnet flow:

`send my mum 50k every 1st of the month`

The app keeps the Choco MiniPay screen style, connects to the user's wallet, reads stablecoin balances, asks whether to send now or schedule, and then asks the wallet to sign the selected action. Choco does not custody funds or private keys.

## Scope

- Corridor: US to Kenya
- Source asset: USDC
- Destination asset: cKES, the Kenyan Shilling stablecoin displayed to users
- Currency input: optional for this corridor; Choco infers cKES when the user gives a Kenya recipient amount
- Channel: the Choco chat box inside the Transfer screen
- Actions: send now or create one monthly schedule
- Network: Celo Mainnet, chain ID `42220`

## Screen And Flow

This version preserves the structured Choco MiniPay app shell: splash, pitch, home, wallet gate, transfer composer, processing, duplicate guard, review, plans, plan detail, delete confirmation, history, receipt detail, demo tour, and support/future info panels. The simplification is in the flow and integrations, not the visual layer.

## How The Flow Works

1. User opens Choco in MiniPay or a Celo wallet browser.
2. Choco reads connected-wallet balances on-chain: USDC, cKES, CELO, and supported assets.
3. User enters a plain-language transfer instruction. For example, `20k mom every 1st` means Mum receives `20,000 cKES`.
4. User chooses `Now` or `Schedule`.
5. Now: cKES transfers go wallet -> recipient directly; USDC settles USDC -> USDm -> cKES through the Mento Broker (each hop wallet-signed), then the cKES is delivered to the recipient. No custom router contract.
6. Schedule: wallet approval points to a keeper settlement spender and Choco records the plan in the single schedule registry.
7. Choco displays the mined transaction hash, status, timestamp, and explorer receipt. Plans and history are re-read from registry events, never stored off-chain.

Send-now USDC uses Mento's own Broker, so the only Choco-owned contract is `ChocoScheduleRegistry`. The keeper (settlement spender) is an off-chain executor address, not a frontend dependency.

## Contacts And Privacy

Choco does not store contacts. For production, recipient aliases should resolve through ODIS/SocialConnect and Celo Mainnet `FederatedAttestations`, then the resolved address is used only to prepare the wallet action.

The user-facing rule is:

`Choco checks wallet funds and resolves the recipient only for this action. Contacts are not stored.`

## Run Locally

```bash
npm install
npm run dev
```

Open the local URL in a browser. For signing, use MiniPay or another wallet browser on Celo Mainnet.

## Deployment

Frontend is a static Vite build; point any CDN at `dist/` after `npm run build`. The one backend dependency is the keeper that settles scheduled plans (see `contracts/README.md`).

### Demo vs Production URLs

- **Demo**: `https://choco-azure.vercel.app/` (default in code, used for testing/development)
- **Production**: `choco-minipay.vercel.app` (set via environment variables in Vercel)

For production deployment, override these environment variables in Vercel:

```
VITE_LIVE_DEMO_URL=https://choco-minipay.vercel.app/
VITE_AGENT_URI=https://choco-minipay.vercel.app/agent.json
```

All other env vars (registry address, agent ID, Supabase, contracts) should match your mainnet deployment config. See [docs/deployment.md](docs/deployment.md) for the full checklist.

## Configure

Copy `.env.example` to `.env` and set:

```bash
VITE_REGISTRY_ADDRESS=0x...
VITE_REGISTRY_DEPLOY_BLOCK=...
VITE_SETTLEMENT_SPENDER_ADDRESS=0x...
VITE_DEMO_RECIPIENT_ADDRESS=0x...
```

Mento Broker and the ERC-8004 registry ship with mainnet defaults in `.env.example`; after registration, set `VITE_AGENT_ID` and `VITE_AGENT_OWNER_ADDRESS`.

`VITE_DEMO_RECIPIENT_ADDRESS` is only for demos. The app does not show a raw address paste field in the transfer flow; production should resolve the recipient through MiniPay phone/alias lookup.

## Validate

```bash
npm run check
npm run contracts:test
```

The web check runs parser tests and a Vite build. The contract test compiles and tests the fund-less schedule registry.

## choco_test Reference

The `scripts/contract-example-demo.mjs` script preserves the contract-interaction pattern from `choco_test`: ethers v6, Celo Mainnet RPC, `PRIVATE_KEY` from env, call the sample contract's register method, then read its counter and last-user values. This sample contract is not Choco's product contract.

```bash
PRIVATE_KEY=0x... npm run demo:contract-example
```

Do not commit `PRIVATE_KEY`.

## Choco Contract

`contracts/src/ChocoScheduleRegistry.sol` is the only Choco contract in this repo. It is a fund-less schedule registry: it records wallet-approved actions and receipts, but it does not hold user funds. Scheduled execution requires a keeper settlement spender in `VITE_SETTLEMENT_SPENDER_ADDRESS`; send-now USDC settles through the Mento Broker directly.

## Celo And MiniPay Notes

- MiniPay is detected with `window.ethereum.isMiniPay`.
- The app uses viem because Celo fee-currency transactions need `feeCurrency` support.
- The default network fee currency is the USDC adapter address, not the USDC token address.
- User-facing copy uses MiniPay terms such as Network fee and Stablecoin.
- The app does not display CELO balances or ask users to hold CELO.

## Docs

- `docs/architecture.md` explains the agent, wallet, Mento Broker, and registry boundary.
- `docs/contact-resolution.md` explains ODIS/SocialConnect recipient lookup without storing contacts.
- `docs/env-and-release.md` records the env, gitignore, and dockerignore review.
- `docs/repository-audit.md` maps the architecture review to safe implementation blocks.
- `contracts/README.md` explains the schedule registry.
- `public/agent.json` is ERC-8004 metadata for a fresh Celo Mainnet registration (points to choco-azure.vercel.app). Register with `npm run register:agent`, then optionally pin to IPFS and `setAgentURI`. See `docs/checklist.md`.
- `docs/agent-flow.md` describes the unified Choco Agent flow (USDC balance gate, contact lookup, Cepolia Skill on Confirm Send, audit logging).
