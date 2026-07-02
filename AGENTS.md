# Choco Agent Notes

Choco is a MiniPay-first financial agent for Celo Mainnet. Keep the implementation clear and non-custodial in user language: Choco reads balances, prepares actions, and asks the wallet to sign. It must never request private keys.

## Architecture

- `src/chain` contains Celo clients, token reads, swaps, schedules, and history mapping.
- `src/lib` contains product logic: config, intent parsing, readiness, fees, contacts, and support helpers.
- `src/modules` contains React hooks for wallet, ledger, transfer, contacts, notifications, and voice.
- `src/screens` contains full-screen UI composition.
- `src/components` contains shared UI primitives.
- `contracts` contains ChocoLedger and ChocoGateway source, tests, and deployment scripts.

## Agent Skills

Use the Celo ecosystem skill before changing contract addresses, exchange IDs, MiniPay behavior, Mento routing, or Celo Mainnet assumptions:

```bash
npx skills add celo-org/celopedia-skills
```

## Product Rules

- Main network is Celo Mainnet.
- README is the source of truth for active contracts, deployment, and schedule worker setup.
- Recipient identity starts with Agent Choco intent detection, then contact resolution when available.
- Wallet balances must be read from chain state and must not be described as Choco-held balances.
- Plans, movements, and receipts must be rebuilt from ChocoLedger and gateway events.
- Route details should stay internal unless the app needs to explain a failure or temporary fallback.
