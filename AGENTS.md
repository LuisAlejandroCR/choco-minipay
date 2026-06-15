# Choco Agent Notes

Choco is a MiniPay-first remittance agent. Keep the implementation non-custodial: the app can read balances, prepare actions, and ask the wallet to sign, but it must not hold private keys or funds.

## Architecture

- Keep product state and Celo primitives in `src/lib`.
- Keep reusable UI in `src/components`.
- Keep screen-level composition in `src/screens`.
- Keep Celo contract code under `contracts`.
- Keep hackathon and release notes under `docs`.

## Agent Skills

This project uses the following agent skills (tracked in `skills-lock.json`). Install them with:

```
npx skills add celo-org/celopedia-skills
npx skills add supabase/agent-skills
```

- **celopedia-skill** — Celo ecosystem reference (verified contract addresses, Mento protocol, MiniPay, ERC-8004). **Always consult this skill before changing any Celo contract address, exchange ID, or protocol integration.**
- **supabase** — Supabase SDK patterns and Postgres best practices.

## Product Rules

- Main network is Celo Mainnet.
- Recipient identity comes from Agent Choco intent detection, then later from MiniPay contact/alias lookup.
- Plans, history, and receipts must stay behind verified-wallet access.
- Wallet balances must be read from chain state and must never be described as Choco-held funds.
- History and scheduled plans should be derived from wallet transactions, registry events, and protocol activity.
