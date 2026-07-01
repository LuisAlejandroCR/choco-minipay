# Security Policy

Choco moves real user funds on Celo Mainnet, so we take security seriously.

## Reporting a vulnerability

Please report vulnerabilities **privately** — do not open a public issue or PR.

- **Email:** security@usechoco.app *(replace with your real security contact before publishing)*
- Include: a description, the affected component (frontend / keeper / contracts), reproduction steps, and the impact.
- We aim to acknowledge within **72 hours** and to keep you updated on remediation.

Please allow a reasonable window to remediate before any public disclosure. We credit responsible disclosures.

## Scope

**Smart contracts — deployed on Celo Mainnet, immutable (non-upgradeable):**

| Contract | Address |
|---|---|
| ChocoLedger (registry + audit log, **holds no funds**) | `0x15659C181f31e5A463BcaB7E2cc706B0b336967C` |
| ChocoGateway (funds: swaps, escrow locks, settlement) | `0x900F0c07b08483e860B4055892528dAE08eE56b3` |

Because the contracts can't be patched in place, a confirmed contract-level issue requires a redeploy + migration; in the interim, high-impact findings may be mitigated off-chain in the keeper or frontend.

Also in scope:
- The keeper / off-chain settlement (`scripts/choco-keeper.mjs`).
- The frontend wallet, approval, and transfer flows (`src/`).

## Out of scope

- Vulnerabilities in third-party protocols (Mento, Uniswap V3, MiniPay) — report those upstream.
- Known design tradeoffs documented in [`contracts/AUDIT.md`](contracts/AUDIT.md).

## Design notes for researchers

- Funds live only in **ChocoGateway**; **ChocoLedger holds no funds** (it is a registry + append-only audit log).
- The keeper can *trigger* but not *redirect* a scheduled run — recipient and amount are read from the on-chain schedule, not from the caller.
- Schedule controls (create / cancel / pause / resume) are owner-gated; settlement is keeper-gated and rate-limited.
