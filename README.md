# Choco Miniapp Production

Production-ready Choco MiniPay app for Celo remittance flows.

Repository split:

- MVP static demo: `choco` -> `LuisAlejandroCR/choco`
- Production app: `Choco Minipay` -> `LuisAlejandroCR/choco-minipay`

Choco is a MiniPay-native remittance concierge for family transfers, scheduled runs, phone/alias identity, Celo receipts, and ERC-8004 agent provenance.

## Project Tree

```text
.
|-- .github/
|   `-- workflows/
|       `-- ci.yml
|-- apps/
|   `-- web/
|       |-- index.html
|       `-- src/
|           |-- App.jsx
|           |-- components/
|           |   |-- ChocoMark.jsx
|           |   |-- DemoVisual.jsx
|           |   `-- PitchScreen.jsx
|           |-- config/
|           |   `-- runtime.js
|           |-- content/
|           |   |-- demoFlow.js
|           |   `-- reviewLinks.js
|           |-- data/
|           |   `-- testnetScenario.js
|           |-- main.jsx
|           |-- styles.css
|           `-- modules/
|               `-- wallet/
|                   |-- useMiniPayWallet.js
|                   `-- useMiniPayWallet.test.js
|-- docker/
|   |-- api.Dockerfile
|   |-- docker-compose.local.yml
|   |-- docker-compose.production.yml
|   |-- nginx.conf
|   |-- web.Dockerfile
|   `-- worker.Dockerfile
|-- docs/
|   |-- architecture/
|   |   |-- architecture.md
|   |   |-- delivery-blocks.md
|   |   |-- deployment-stages.md
|   |   `-- useful-files.md
|   |-- competition-positioning.md
|   `-- runbook-celo-agent-registration.md
|-- ops/
|   `-- agent-registry/
|       |-- agent.sepolia.json
|       `-- register-agent.ts
|-- packages/
|   `-- core/
|       `-- src/
|           |-- config/
|           |   `-- celo.js
|           `-- domain/
|               |-- amounts.js
|               |-- duplicates.js
|               |-- duplicates.test.js
|               |-- intent.js
|               |-- intent.test.js
|               |-- receipts.js
|               `-- receipts.test.js
|-- public/
|   |-- agent.json
|   |-- icon.svg
|   |-- privacy.html
|   |-- review.css
|   |-- stats.html
|   |-- support.html
|   |-- support.js
|   `-- terms.html
|-- services/
|   |-- api/
|   |   `-- src/
|   |       `-- server.js
|   `-- worker/
|       `-- src/
|           `-- scheduler.js
|-- .dockerignore
|-- .env
|-- .gitignore
|-- package-lock.json
|-- package.json
|-- README.md
|-- vercel.json
`-- vite.config.mjs
```

## 1. Start With Docker

Build and run the production service set:

```bash
docker compose -f docker/docker-compose.production.yml up --build
```

Open:

```text
Web: http://127.0.0.1:8080
API: http://127.0.0.1:8787/health
```

Run only the API and worker shells:

```bash
docker compose -f docker/docker-compose.local.yml up --build
```

Use `.env` as the environment contract for local and deployed services.
Keep `VITE_INITIAL_SCREEN=splash` when validating the Docker build so the intro animation is visible before the pitch screen.

## 2. Local Node Path

Local Node is optional. Use it when you need Vite hot reload or faster unit-test loops.

Install from the lockfile:

```bash
npm ci
```

Run the web app:

```bash
npm run dev:web
```

Run API and worker shells:

```bash
npm run dev:api
npm run dev:worker
```

## 3. Validate

```bash
npm run test
npm run build:web
npm run check
```

CI, Docker, and Vercel use `npm ci`; keep `package-lock.json` committed.

## 4. Docker Layout

The Docker layout keeps `web`, `api`, and `worker` as separate services so each can be deployed and scaled independently.

## 5. Deploy Web On Vercel

Use the production GitHub repo:

```text
https://github.com/LuisAlejandroCR/choco-minipay
```

Vercel settings are defined in `vercel.json`:

```text
Install command: npm ci
Build command: npm run build:web
Output directory: dist/web
Production URL: https://choco-minipay.vercel.app
```

After the first deployment, confirm these public URLs return 200:

```text
https://choco-minipay.vercel.app
https://choco-minipay.vercel.app/agent.json
https://choco-minipay.vercel.app/privacy.html
https://choco-minipay.vercel.app/terms.html
```

## 6. Agent Registry

Generate public agent metadata:

```bash
npm run agent:generate
```

Register the ERC-8004 agent after the metadata URL is live:

```bash
npm run agent:register
```

Use [docs/runbook-celo-agent-registration.md](docs/runbook-celo-agent-registration.md) for registry steps, signer setup, and operational safety notes.

## Wallet Network Config

Choco targets Celo Sepolia testnet until the mainnet release is approved. Network defaults live in `packages/core/src/config/celo.js`; deployment overrides live in `.env`.

For the web app, keep `VITE_CELO_NETWORK_KEY`, `VITE_CELO_CHAIN_ID`, `VITE_CELO_CHAIN_ID_HEX`, `VITE_CELO_RPC_URL`, `VITE_BLOCK_EXPLORER_URL`, and `VITE_BLOCK_EXPLORER_TX_URL` aligned. For the API, keep `RPC_URL` on the same network so wallet verification, background readiness checks, and receipt links all point to Celo Sepolia.

## Celo And MiniPay Rules

- Detect MiniPay with `window.ethereum.isMiniPay === true`.
- Desktop browser testing uses an injected wallet extension on Celo Sepolia.
- Mobile browser testing opens the current Choco URL in MetaMask Mobile before MiniApps publishing.
- MiniPay wallet validation is tested when Choco is opened inside the MiniPay WebView.
- Do not depend on message-signing auth.
- Use Celo Sepolia testnet for wallet verification, agent review, and receipt paths until mainnet release.
- After wallet verification, call Choco Agent AI readiness through `/v1/agent/preflight` in the background when the user reaches quote review.
- Never mark a send-now movement as `Sent` until a real on-chain transaction hash exists.
- Keep user-facing balances and transfers stablecoin-only: USDC, USDT, USDm.
- Use MiniPay terms: `Network fee`, `Deposit`, `Withdraw`, `Stablecoin`.
- Test the web app at 360 x 640.
- Prefer phone/alias identity; show raw addresses only as secondary technical detail.
- Keep mainnet fee-currency adapter addresses out of active UI until mainnet release.
- Store sample transaction hashes for every user-facing transaction path.

## Release Readiness

Before production release:

- MiniPay detection works in the MiniPay WebView.
- Wallet-ready flow calls Choco Agent AI readiness before transfer creation.
- Send-now readiness blocks when the API reports missing Celo Sepolia testnet gas funds or recipient contact.
- Celo Sepolia transaction and receipt paths are verified.
- ERC-8004 metadata is public and registered.
- Quote, ODIS, API, worker, and analytics integrations are connected through module boundaries.
- Terms, privacy, support, and stats pages contain final production content.
- Support form is connected to the final chat, inbox, or ticket endpoint.
- Docker production compose builds all services.

## Testnet Testing

Run the API and web app locally:

```bash
npm run dev:api
npm run dev:web
```

Open the web app, connect a Celo Sepolia testnet wallet, then start `New transfer`. Choco Agent AI checks wallet readiness in the background when the transfer reaches quote review. The API checks Celo Sepolia RPC for wallet gas funds and verifies the recipient contact payload. A blocked response is expected when the wallet has `0 CELO`.

Browser testing paths:

- Desktop browser: install or enable a wallet extension, switch it to Celo Sepolia, then verify the wallet in Choco.
- Mobile browser: tap `Open in MetaMask Mobile`; Choco opens the same URL inside the wallet app for connection.
- MiniPay: open Choco inside MiniPay after MiniApp discovery/publishing is ready.

For very small testnet trials, use low KESm amounts in the transfer instruction and keep only enough Celo Sepolia CELO for gas. Choco must show `Wallet check needed` when the wallet has no testnet gas.

Direct API test from PowerShell:

```powershell
$body = @{
  walletAddress = "0x0000000000000000000000000000000000000001"
  chainId = "0xaa044c"
  recipientContact = "Mom"
} | ConvertTo-Json

Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:8787/v1/agent/preflight" -ContentType "application/json" -Body $body
```

Direct API test from bash:

```bash
curl -X POST http://127.0.0.1:8787/v1/agent/preflight \
  -H "Content-Type: application/json" \
  -d "{\"walletAddress\":\"0x0000000000000000000000000000000000000001\",\"chainId\":\"0xaa044c\",\"recipientContact\":\"Mom\"}"
```

For Vercel, set `VITE_API_BASE_URL` to the deployed API service. The static web deployment cannot run Choco Agent AI readiness by itself.

## References

- Architecture: [docs/architecture/architecture.md](docs/architecture/architecture.md)
- Delivery blocks: [docs/architecture/delivery-blocks.md](docs/architecture/delivery-blocks.md)
- Deployment stages: [docs/architecture/deployment-stages.md](docs/architecture/deployment-stages.md)
- Useful files: [docs/architecture/useful-files.md](docs/architecture/useful-files.md)
- Agent registration: [docs/runbook-celo-agent-registration.md](docs/runbook-celo-agent-registration.md)
- Competitor positioning: [docs/competition-positioning.md](docs/competition-positioning.md)
