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
|           |-- main.jsx
|           |-- styles.css
|           `-- modules/
|               `-- wallet/
|                   `-- useMiniPayWallet.js
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
|   |-- stats.html
|   |-- support.html
|   `-- terms.html
|-- services/
|   |-- api/
|   |   `-- src/
|   |       `-- server.js
|   `-- worker/
|       `-- src/
|           `-- scheduler.js
|-- .dockerignore
|-- .env.example
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

Use `.env.example` as the environment contract for local and deployed services.

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

## Celo And MiniPay Rules

- Detect MiniPay with `window.ethereum.isMiniPay === true`.
- Do not depend on message-signing auth.
- Keep user-facing balances and transfers stablecoin-only: USDC, USDT, USDm.
- Use MiniPay terms: `Network fee`, `Deposit`, `Withdraw`, `Stablecoin`.
- Test the web app at 360 x 640.
- Prefer phone/alias identity; show raw addresses only as secondary technical detail.
- Use Celo mainnet fee-currency adapter addresses for USDC/USDT.
- Store sample transaction hashes for every user-facing transaction path.

## Release Readiness

Before production release:

- MiniPay detection works in the MiniPay WebView.
- Celo Sepolia transaction and receipt paths are verified.
- ERC-8004 metadata is public and registered.
- Quote, ODIS, API, worker, and analytics integrations are connected through module boundaries.
- Terms, privacy, support, and stats pages contain final production content.
- Docker production compose builds all services.

## References

- Architecture: [docs/architecture/architecture.md](docs/architecture/architecture.md)
- Delivery blocks: [docs/architecture/delivery-blocks.md](docs/architecture/delivery-blocks.md)
- Deployment stages: [docs/architecture/deployment-stages.md](docs/architecture/deployment-stages.md)
- Useful files: [docs/architecture/useful-files.md](docs/architecture/useful-files.md)
- Agent registration: [docs/runbook-celo-agent-registration.md](docs/runbook-celo-agent-registration.md)
- Competitor positioning: [docs/competition-positioning.md](docs/competition-positioning.md)
