# Deployment Stages

Keep the demo MVP and production app separate.

## Stage 1: Demo MVP

Folder:

```text
C:\Users\Unknown Booty\Documents\Projects\Claude\Celo\choco mvp static
```

Purpose:

- Demo the finished MVP frontend.
- Preserve the hackathon prototype.
- Keep the original animation-heavy experience intact.

Do not add production backend, Docker, or compliance work here.

## Stage 2: Testnet Production Candidate

Folder:

```text
C:\Users\Unknown Booty\Documents\Projects\Claude\Celo\Choco Minipay
```

Purpose:

- Build the production app from useful MVP ideas only.
- Test MiniPay detection.
- Test Celo Sepolia transaction and receipt paths.
- Validate ERC-8004 metadata.
- Add quote, ODIS, API, worker, and analytics behind interfaces.

Docker:

- Use Docker for API and worker once integrations need secrets.
- Web may be run locally with Vite, but production path still has a Docker web image.

## Stage 3: Production Build

Production is Docker-first.

Required services:

- `web`: Vite build served by nginx.
- `api`: server-only secrets, quote provider, ODIS, transfer orchestration.
- `worker`: scheduled runs, retries, reconciliation.

Command:

```bash
docker compose -f docker/docker-compose.production.yml build
docker compose -f docker/docker-compose.production.yml up
```

Do not ship production until:

- MiniPay 360 x 640 testing passes.
- Wallet auto-detection works.
- Stablecoin-only copy is verified.
- Route provider and KESm settlement are documented.
- Compliance path is approved.
- Support, privacy, terms, and stats pages are real.
- Testnet hashes exist for every user-facing transaction.

## Stage 4: GitHub And Release

Create a new GitHub repo for:

```text
choco-minipay
```

Push only this folder. Do not push:

- `node_modules`
- `dist`
- demo MVP `src/main.jsx`
- old MVP `src/styles.css`
- local secrets
- private keys
