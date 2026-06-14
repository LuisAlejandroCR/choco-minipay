# Choco Agent Flow

The unified transfer flow as specified for mainnet. There is **one entry point** (New Transfer) and
no separate Pay Receipt screen.

**Data storage:** Choco does not store any user data. Supabase is used only to store contacts created
by the user with prior authorization (when the user pastes an address, they are asked for permission
to save it). All transaction data lives on-chain: the audit contract records transfer attempts, and
transaction history is reconstructed from blockchain events.

## Flow

1. **User opens New Transfer** → composer with the Choco Agent textarea + Now/Schedule toggle.
2. **Choco Agent detects intent** → `parseTransferIntent` (`src/lib/intent.js`) extracts recipient label, amount, currency, timing, confidence.
3. **Cepolia Skill — readiness** → `verifyReadiness({ account, intent })` checks wallet, intent shape, and USDC balance.
   - If `ok` → continue.
   - If not → flow is rejected with a UX message ("Insufficient USDC. Fund your account…"). **No on-chain audit** is written, because nothing touched the chain.
4. **Contact lookup** → if the recipient label matches a previously saved contact for the connected wallet, the destination address is pre-resolved from Supabase. Otherwise the `ContactCapture` form on Review asks the user to paste the address. **On submit, the user is asked for permission to save the contact** — only if authorized does Choco write to Supabase.
5. **Confirm Send screen** → Cepolia Skill (`src/lib/cepolia.js`) supplies:
   - Recipient receives (live cKES quote via Mento)
   - Wallet pays (USDC)
   - Network fee (gas estimate in CELO)
   - Total cost
6. **User confirms** → `confirmAction` runs:
   - cKES-source → direct cKES transfer.
   - USDC-source → Mento two-hop swap (USDC → USDm → cKES) + cKES transfer to recipient.
7. **Audit log: success or failure** → after the transfer, an on-chain log entry is appended to `ChocoAuditLog` (`SUCCESS`, `FAILED_SWAP`, or `FAILED_TRANSFER`).
8. **History** → `useChocoLedger` re-reads `ChocoCkesSwap.UsdcToCkesSwap` + cKES `Transfer(from=user)` events, joins contact labels from Supabase, sorts by block timestamp.

## Component responsibilities

| Component | Owns |
|---|---|
| Choco Agent (`src/lib/agent-choco.js`, `src/lib/intent.js`) | Intent detection, validation, business rules, confirmation flow, contact lookup. **Does not store data.** |
| Cepolia Skill (`src/lib/cepolia.js`) | Live quote, gas estimation, Recipient gets / Wallet pays / Total cost on Confirm Send |
| Supabase (`src/lib/contacts.js`) | Stores contacts **only with prior user authorization**. Add/edit/remove operations require user consent. Not used for transaction history or payment validation. |
| USDC mainnet contract `0xcebA93…118C` | Source funds + balance verification |
| cKES contract `0x456a3D…B0d0` | Destination transfer |
| Mento Broker `0x777A…CaD` + `ChocoCkesSwap` | USDC → cKES conversion |
| `ChocoAuditLog` | Immutable on-chain audit trail of every attempt (success/fail/insufficient/rejected) |
| `ChocoScheduleRegistry` | Monthly schedules (unchanged from earlier blocks) |

## Audit kinds (on-chain)

Only events that already touched the chain are audited. Pre-flight UX states are not logged
on-chain to avoid asking the user to sign just to record a non-event.

| Value | When | Signature cost |
|---|---|---|
| `SUCCESS` (0) | cKES delivered to recipient | 1 extra (post-confirm) |
| `FAILED_SWAP` (1) | Mento swap reverted on-chain | 1 extra (post-revert) |
| `FAILED_TRANSFER` (2) | cKES transfer reverted on-chain | 1 extra (post-revert) |

Kinds `INSUFFICIENT_FUNDS` (3) and `REJECTED` (4) remain in the contract enum for
forward-compatibility but are **not called** from the frontend. The corresponding cases are
surfaced as Cepolia Skill UX messages instead.

## Cepolia readiness verdicts (UX-only, no signatures)

`READINESS_REASON` (from `src/lib/cepolia.js`):

| Value | Surfaced as |
|---|---|
| `OK` | continue to Review |
| `NO_INTENT` | "Choco Agent still needs more detail." |
| `NO_WALLET` | "Connect your wallet to continue." |
| `INSUFFICIENT_USDC` | "Insufficient USDC. Fund your account with USDC before continuing." |
| `BALANCE_READ_FAILED` | "Could not check USDC balance: …" |

## Configuration

```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_AUDIT_CONTRACT_ADDRESS=
VITE_CKES_SWAP_CONTRACT_ADDRESS=
```

**Supabase is optional.** If `VITE_SUPABASE_URL` is not set, the app works without contact persistence
(the user pastes addresses every time, nothing is saved). If configured, apply `supabase/schema.sql` once.
The old `receipts` and `transactions` tables are explicitly dropped in that migration — re-applying is safe.

## Deployment order

1. Deploy `ChocoCkesSwap` (`npm --prefix contracts run deploy:swap`) → set `VITE_CKES_SWAP_CONTRACT_ADDRESS`.
2. Deploy `ChocoAuditLog` (`npm --prefix contracts run deploy:audit`) → set `VITE_AUDIT_CONTRACT_ADDRESS`.
3. Apply `supabase/schema.sql` (drops obsolete tables, creates `contacts`).
4. Set `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` and redeploy the site.

## Gas notes

- USDC fee currency adapter (`0x2F25…602B`) is used as `feeCurrency` on every wallet write, so the user does not need CELO to sign.
- Mento Broker calls and ERC-20 approvals use `estimateContractGas` via Cepolia when surfacing the network fee.
- `ChocoAuditLog` is intentionally small (one storage write per entry + one event). Note strings are truncated to 120 bytes by `logAuditAttempt` to bound gas.

## What lives off-chain (Supabase) vs on-chain

| Concern | Lives at |
|---|---|
| Contact labels (`dad` → `0x…`) | Supabase `contacts` (with user authorization) or nowhere (if Supabase not configured) |
| Plans (scheduled transfers) | Blockchain: `ChocoScheduleRegistry` events |
| Send-now movements | Blockchain: `ChocoCkesSwap.UsdcToCkesSwap` + cKES `Transfer` events |
| Audit trail | Blockchain: `ChocoAuditLog` events |
| User session data | **Nowhere** — Choco stores nothing. All state derived from wallet + blockchain. |
| Receipts as invoices | **Nowhere** — removed. Receipt label = contact label. |
