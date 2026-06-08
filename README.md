# Choco Minipay

Choco is a MiniPay-focused remittance concierge for diaspora users. The MVP demonstrates a conversational flow where a user gives one text or voice instruction, reviews a USDC to KESm transfer, chooses send-now or scheduled delivery, avoids duplicate plans, and shares a receipt with a Celo explorer proof.

The current repository is a Vite React frontend plus ERC-8004 agent metadata and a one-time registration script. It is ready as an MVP/prototype, but the production app still needs real MiniPay wallet integration, recipient identity resolution, transaction execution, scheduling, monitoring, compliance review, and support operations.

## Current MVP

- Mini App shell with mobile-first remittance flow.
- Splash, pitch, guided demo, home, plans, history, receipt, wallet gate, plan editor, duplicate guard, and review screens.
- Text and simulated voice input for transfer intent.
- Send-now and scheduled transfer modes.
- Duplicate detection for similar scheduled plans and recent one-time sends.
- Receipt view with QR code, share text, from/to/date/hash details, and Celo Sepolia Blockscout verification link.
- Project panel describing the first corridor: US to Kenya, USDC in, KESm out.
- ERC-8004 agent metadata in `agent.json`.
- Celo Sepolia/mainnet ERC-8004 Identity Registry helper in `register-agent.ts`.

## Product Scope

First production corridor:

- User: diaspora sender using MiniPay.
- Recipient: family contact in Kenya.
- Payment asset: MiniPay-supported stablecoin, currently positioned as USDC.
- Destination asset: KESm, pending final route and liquidity source.
- Modes: send once now or create a recurring schedule.
- Agent role: parse intent, quote route, check repeats, request confirmation, execute or schedule, retry failed runs, notify recipient, and file receipt.

Future scope shown in the MVP:

- UK to NGN corridor.
- WhatsApp, Telegram, Messenger, and other social messaging channels.
- Recipient status alerts.

## Repository Layout

```text
.
|-- src/
|   |-- main.jsx          # React app, state, screens, demo data, transfer parsing
|   `-- styles.css        # Mini App shell and responsive styling
|-- docs/
|   `-- architecture/
|       |-- production-architecture.md
|       |-- module-map.md
|       |-- blockchain-requirements.md
|       |-- deployment-stages.md
|       |-- production-checklist.md
|       `-- missing-sources.md
|-- agent.json            # ERC-8004 metadata currently hosted by the app
|-- register-agent.ts     # One-time Celo ERC-8004 Identity Registry script
|-- Celo Agent Registration Guide.md
|-- index.html
|-- package.json
|-- package-lock.json
`-- vite.config.mjs
```

## Run Locally

```bash
npm install
npm run dev
```

The Vite dev server binds to `127.0.0.1`.

## Build

```bash
npm run build
```

`npm test` currently aliases the production build.

## Blockchain And Agent Identity

Current `agent.json`:

- Type: `https://eips.ethereum.org/EIPS/eip-8004#registration-v1`
- Name: `Choco`
- App endpoint: `https://choco-minipay.vercel.app`
- Wallet endpoint: `eip155:11142220:0x282DD05E60fC7fd8DCBa184C2d5fF9d8d40974be`
- Trust mode: `reputation`

The UI references agent `#309` on Celo Sepolia:

- Registry page: `https://testnet.8004scan.io/agents/celo-sepolia/309`
- Receipt explorer base: `https://celo-sepolia.blockscout.com/tx`

Before production, confirm the real `agentId`, owner wallet, transaction hash, hosted metadata URL, and whether the agent metadata should be pinned to IPFS or kept as HTTPS metadata.

## Production Architecture

See [docs/architecture/production-architecture.md](docs/architecture/production-architecture.md).

For deployment sequencing, use [docs/architecture/deployment-stages.md](docs/architecture/deployment-stages.md). The short version: deploy the current MVP frontend as a static app; use Docker once backend API, workers, scheduler, secrets, and production integrations exist.

Recommended modules:

- `app-shell`: MiniPay WebView detection, routing, layout, legal links, and low-bandwidth UX.
- `wallet`: zero-click MiniPay wallet access, balance checks, stablecoin preference, fee-currency handling, and transaction submission.
- `identity`: phone-number identity, contact aliases, ODIS/SocialConnect lookups, and recipient safety checks.
- `intent`: text/voice parsing, quote normalization, review copy, duplicate detection, and validation.
- `quotes`: USDC/KESm quote source, fees, route availability, slippage/rate limits, and expiry.
- `transfers`: send-now execution, schedule creation, approvals, settlement, retries, and reconciliation.
- `receipts`: explorer links, QR/deeplinks, transaction status, share text, and support trace IDs.
- `agent-registry`: ERC-8004 metadata, registry scripts, reputation hooks, and agent provenance.
- `ops`: analytics, logs, alerts, support dashboard, SLA tracking, and incident playbooks.

## Production Gaps

- No MiniPay wallet provider integration yet. Current wallet gate is local UI state.
- No real transaction signing or settlement from the frontend.
- No backend worker for schedules, retries, notifications, or reconciliation.
- No real quote provider or KESm route integration.
- No ODIS/SocialConnect recipient lookup yet.
- No legal, KYC/AML, remittance licensing, or partner compliance source files yet.
- No privacy policy, terms of service, support route, or operational SLA page in the app.
- No analytics, `/stats` page, monitoring, or incident response system yet.
- No contract code beyond the ERC-8004 registry interaction script.
- No automated frontend tests beyond `vite build`.

## MiniPay Readiness Notes

Based on the local reference docs and official MiniPay/Celo docs reviewed during this pass:

- Use zero-click wallet access inside MiniPay; do not show a connect-wallet button when `window.ethereum.isMiniPay === true`.
- Do not use message signing for auth; MiniPay does not support those wallet methods.
- Use phone number, recipient alias, or truncated secondary hint instead of raw addresses as the primary identity.
- Show only MiniPay-supported stablecoins in user-facing UI: USDC, USDT, USDm.
- Use stablecoin fee abstraction correctly; USDC/USDT fee-currency adapters are not the same as the token addresses on mainnet.
- Validate at 360 x 640 mobile viewport before submission.
- Provide a URL/origin manifest for every external origin the app calls.
- Provide sample transaction hashes for every user-facing transaction path.
- Include accessible Terms of Service and Privacy Policy.
- Prepare analytics or a `/stats` page with product and on-chain metrics.
- Maintain a support process that can handle critical issues within 24 hours.

## ERC-8004 Registration

Operational registration steps live in [Celo Agent Registration Guide.md](<Celo Agent Registration Guide.md>). Keep the README focused on product, architecture, and production readiness; use the guide for registry commands, environment variables, and key-handling rules.

## Sources To Confirm Before Shipping

The architecture packet includes a full source request list in [docs/architecture/missing-sources.md](docs/architecture/missing-sources.md). The most important missing sources are:

- Final production network: Celo Sepolia pilot or Celo Mainnet launch.
- Real deployed app URL and agent metadata URL.
- ERC-8004 registration evidence: `agentId`, owner wallet, transaction hash, registry URL.
- KESm route provider, token contract, quote API, settlement path, and fees.
- Compliance and licensing path for the remittance corridor.
- MiniPay submission contact/status and official review requirements for this exact app.
- Wallet, signer, key-management, and custody policy.
- Production analytics, support, and incident-management tooling.

## References

- MiniPay docs: https://docs.minipay.xyz/
- MiniPay submission docs: https://docs.minipay.xyz/getting-started/submit-your-miniapp.html
- MiniPay wallet connection docs: https://docs.minipay.xyz/getting-started/wallet-connection.html
- MiniPay deeplinks: https://docs.minipay.xyz/technical-references/deeplinks.html
- Celo network overview: https://docs.celo.org/build-on-celo/network-overview
- Celo ERC-8004 docs: https://docs.celo.org/build-on-celo/build-with-ai/8004
- ERC-8004 spec: https://eips.ethereum.org/EIPS/eip-8004
- 8004scan testnet: https://testnet.8004scan.io
- Celo Sepolia Blockscout: https://celo-sepolia.blockscout.com
