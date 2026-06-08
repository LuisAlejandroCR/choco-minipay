# Choco Miniapp Production

Production-ready Choco MiniPay app for Celo remittance flows.

Repository split:

- MVP static demo: `choco mvp static` -> `LuisAlejandroCR/choco`
- Production app: `Choco Minipay` -> `LuisAlejandroCR/choco-minipay`

Choco is a MiniPay-native remittance concierge for family transfers, scheduled runs, phone/alias identity, Celo receipts, and ERC-8004 agent provenance.

## Project Map

```text
apps/web/                 MiniPay-facing web app
packages/core/            Shared domain logic and tests
services/api/             API shell for quotes, identity, and transfer orchestration
services/worker/          Scheduler, retries, and reconciliation shell
ops/agent-registry/       ERC-8004 metadata and registration script
docker/                   Web, API, worker images and compose files
docs/                     Deployment notes, positioning, and runbooks
public/                   Agent metadata, icon, legal, support, and stats pages
```

## 1. Install

```bash
npm install
```

Use `.env.example` as the environment contract for local and deployed services.

## 2. Run Locally

Web app:

```bash
npm run dev:web
```

API and worker shells:

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

## 4. Run With Docker

Production compose:

```bash
docker compose -f docker/docker-compose.production.yml build
docker compose -f docker/docker-compose.production.yml up
```

Local service compose:

```bash
docker compose -f docker/docker-compose.local.yml up --build
```

The Docker layout keeps `web`, `api`, and `worker` as separate services so each can be deployed and scaled independently.

## 5. Agent Registry

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

- Deployment stages: [docs/architecture/deployment-stages.md](docs/architecture/deployment-stages.md)
- Useful files: [docs/architecture/useful-files.md](docs/architecture/useful-files.md)
- Agent registration: [docs/runbook-celo-agent-registration.md](docs/runbook-celo-agent-registration.md)
- Competitor positioning: [docs/competition-positioning.md](docs/competition-positioning.md)
