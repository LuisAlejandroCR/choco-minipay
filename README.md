# Choco Miniapp Production

Production-oriented Choco MiniPay repository. The MVP static repo lives in `choco mvp static` and is pushed to `LuisAlejandroCR/choco`; this production repo lives in `Choco Minipay` and is pushed to `LuisAlejandroCR/choco-minipay`.

This repo keeps only useful production files: modular app code, core domain logic, service shells, Docker targets, ERC-8004 ops, env template, CI, and concise docs.

Choco's lane is different from username-first, multi-chain payment apps: Choco is a MiniPay-native remittance concierge for family transfers, scheduled runs, phone/alias identity, Celo receipts, and ERC-8004 agent provenance.

## Repo Stages

Do not mix stages:

- **Stage 1: MVP frontend deploy** - static Vite app, public `agent.json`, product review. No Docker required.
- **Stage 2: testnet integration** - MiniPay wallet detection, Celo Sepolia hashes, ODIS/quote experiments. Docker only if API or worker exists.
- **Stage 3: production build** - web, API, worker, ledger, reconciliation, secrets, compliance, monitoring. Docker required.
- **Stage 4: production release** - Dockerized web/API/worker after readiness checks.

See [docs/architecture/deployment-stages.md](docs/architecture/deployment-stages.md).

## Production Shape

```text
apps/web/                 # MiniPay-facing web app
packages/core/            # Pure Celo, MiniPay, intent, receipt, and duplicate logic
services/api/             # Server-only API for secrets, quotes, identity, and transfer orchestration
services/worker/          # Scheduler, retries, reconciliation
ops/agent-registry/       # ERC-8004 metadata and registration script
docker/                   # API/worker Docker targets
docs/                     # Architecture, blockchain, deployment, and runbooks
public/                   # agent.json, icon, legal/support/static review pages
```

## Fast Local Start

```bash
npm install
npm run dev:web
```

In another terminal when backend work begins:

```bash
npm run dev:api
npm run dev:worker
```

## Checks

```bash
npm run test
npm run build:web
npm run check
```

## Docker

Production stage is Docker-first:

```bash
docker compose -f docker/docker-compose.production.yml build
docker compose -f docker/docker-compose.production.yml up
```

For local service testing:

```bash
docker compose -f docker/docker-compose.local.yml up --build
```

The web image builds the Vite app and serves it with nginx. The API and worker images run separately so they can scale and fail independently.

## Celo/MiniPay Rules

From Celopedia and MiniPay docs:

- Zero-click MiniPay wallet access when `window.ethereum.isMiniPay === true`.
- No message-signing auth dependency.
- Stablecoin-only UI: USDC, USDT, USDm.
- No CELO token in user-facing balances or copy.
- Use `Network fee`, `Deposit`, `Withdraw`, and `Stablecoin` in UI copy.
- Test at 360 x 640.
- Use phone/alias identity first; raw addresses only as secondary technical detail.
- Use USDC/USDT fee-currency adapter addresses for Celo mainnet, not token addresses.
- Store sample transaction hashes for each user-facing method.
- Keep private keys and provider API keys server-only.

## Useful Commands

Generate `public/agent.json`:

```bash
npm run agent:generate
```

Register an ERC-8004 agent after metadata is public:

```bash
npm run agent:register
```

The registration runbook lives at [docs/runbook-celo-agent-registration.md](docs/runbook-celo-agent-registration.md).

## GitHub Repo

This folder is ready to become the new repository:

```bash
git init
git branch -M main
git add .
git commit -m "Scaffold production Choco MiniPay app"
```

GitHub CLI is not installed on this machine. Create `LuisAlejandroCR/choco-minipay` in GitHub, then add the remote:

```bash
git remote add origin https://github.com/LuisAlejandroCR/choco-minipay.git
git push -u origin main
```
