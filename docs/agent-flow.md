# Choco Agent Flow

The unified transfer flow for Celo Mainnet. One entry point (New Transfer), no separate
Pay Receipt screen.

**Data storage:** Choco does not store user data. Supabase is used only for contacts the user
explicitly saves. All transaction history is derived from blockchain events.

## Flow

1. **User opens New Transfer** — composer with the Choco Agent textarea + Now/Schedule toggle.
2. **Intent detection** — `parseTransferIntent` (`src/lib/intent.js`) extracts recipient label,
   amount, currency, timing, and confidence.
3. **Cepolia Skill — readiness** — `verifyReadiness({ account, intent })` checks wallet
   connection, intent shape, and USDC balance.
   - `ok` → proceed to Review.
   - not `ok` → UX message surfaced (e.g. "Insufficient USDC…"). **No on-chain audit** is
     written for pre-flight failures — nothing touched the chain.
4. **Contact lookup** — if the recipient label matches a saved contact for the connected wallet,
   the destination address is pre-resolved from Supabase. Otherwise the `ContactCapture` form
   on Review asks the user to paste an address. On submit the user is asked whether to save —
   Choco only writes to Supabase if the user authorizes it.
5. **Review screen** — `summariseTransfer` (cepolia.js) supplies:
   - **Recipient receives** — exactly the cKES amount the user typed (via `quoteExactOut` when
     `intent.amountKes` is set, or a live Mento quote for USDC-only intents)
   - **Wallet pays** — USDC input including fee
   - **Network fee** — gas estimate in CELO
6. **User confirms** → `transfer.confirmAction` runs:
   - **cKES source** → direct ERC-20 transfer to recipient.
   - **USDC source (default)** → `quoteExactOut(ckesExact)` → approve → `swapAndSendExact`
     on ChocoGateway → recipient gets exactly the typed cKES; surplus returned to sender.
     ChocoGateway deducts the protocol fee (0.25%) before swapping.
   - **Fallback (no ChocoGateway)** → direct Mento two-hop: USDC → USDm → cKES, each hop
     wallet-signed, then cKES transferred to recipient.
7. **On-chain audit** — ChocoGateway calls `ChocoLedger.logAttemptFor(payer, ...)` after every
   completed send. This writes an `AttemptLogged` event with `kind = SUCCESS`.
8. **History** — `useChocoLedger` calls `readOwnerLedger`, which reads `UsdcToCkesSwap` +
   cKES `Transfer` events (send-now) and `MonthlyScheduleCreated` + `SettlementReceipt`
   events (schedules), sorted by block timestamp.

## Component responsibilities

| Component | Owns |
|---|---|
| **Choco Agent** (`intent.js`, `agent-choco.js`) | Intent detection, validation, business rules |
| **Cepolia Skill** (`cepolia.js`) | Readiness gate, live quote display on Review screen |
| **useTransfer** (`modules/transfer/`) | Plan build, on-chain execution, receipt commit |
| **useContactResolution** (`modules/contacts/`) | Supabase lookup, contact picker, save flow |
| **useChocoLedger** (`modules/ledger/`) | Reads history + plans from chain on every wallet change |
| **Supabase** (`lib/contacts.js`) | Contact label → address cache (user-authorized only) |
| **ChocoGateway** | Fee deduction, USDC→USDm→cKES swap, TxRecord storage, `logAttemptFor` |
| **ChocoLedger** | `MonthlyScheduleCreated`, `SettlementReceipt`, `AttemptLogged` events |
| USDC `0xcebA93…118C` | Source funds + balance check |
| cKES `0x456a3D…B0d0` | Destination token |
| Mento Broker `0x777A…CaD` | Swap pool (called by ChocoGateway internally) |

## Exact-output swap (default send-now path)

```
User types: "5 cKES to dad"
     │
     ▼
quoteExactOut(5e18)          → usdcNeeded (covers fee + 1% slippage buffer)
approveTokenIfNeeded(usdc, ckesSwap, usdcNeeded)
swapAndSendExact(dad, usdcNeeded, 5e18)
     │
     ├─ fee (0.25%) → feeWallet
     ├─ USDC → USDm → cKES (Mento Broker)
     ├─ exactly 5 cKES → dad
     └─ surplus cKES → sender
```

Recipient always receives exactly the typed amount. No rounding surprises.

## Audit kinds (on-chain, ChocoLedger)

Only events that already touched the chain are logged. Pre-flight UX states are not recorded
to avoid asking the user to sign just to record a non-event.

| Kind | When |
|---|---|
| `SUCCESS` (0) | cKES delivered — logged by ChocoGateway via `logAttemptFor` |
| `FAILED_SWAP` (1) | Mento swap reverted |
| `FAILED_TRANSFER` (2) | cKES transfer reverted |
| `INSUFFICIENT_FUNDS` (3) | Enum only — surfaced as Cepolia UX message, never logged |
| `REJECTED` (4) | Enum only — surfaced as Cepolia UX message, never logged |

## Cepolia readiness verdicts (UX-only, no signatures)

| Value | Surfaced as |
|---|---|
| `OK` | proceed to Review |
| `NO_INTENT` | "Choco Agent still needs more detail." |
| `NO_WALLET` | "Connect your wallet to continue." |
| `INSUFFICIENT_USDC` | "Insufficient USDC. Fund your account before continuing." |
| `BALANCE_READ_FAILED` | "Could not check USDC balance: …" |

## What lives off-chain (Supabase) vs on-chain

| Concern | Lives at |
|---|---|
| Contact labels (`dad` → `0x…`) | Supabase `contacts` (user-authorized only) |
| Plans (scheduled transfers) | ChocoLedger: `MonthlyScheduleCreated` events |
| Send-now movements | ChocoGateway: `UsdcToCkesSwap` + cKES `Transfer` events |
| Audit trail | ChocoLedger: `AttemptLogged` events |
| User session / receipts | Nowhere — all state derived from wallet + chain |

## Configuration

```bash
VITE_CKES_SWAP_CONTRACT_ADDRESS=0x...   # ChocoGateway address
VITE_LEDGER_ADDRESS=0x...               # ChocoLedger address
VITE_SUPABASE_URL=                      # optional — leave blank to disable contact persistence
VITE_SUPABASE_ANON_KEY=
```

Supabase is optional. If `VITE_SUPABASE_URL` is not set, the app works without contact
persistence (users paste addresses every time, nothing is saved). Apply `supabase/schema.sql`
once when enabling it.

## Deployment order

1. Deploy **ChocoLedger** → set `VITE_LEDGER_ADDRESS`, `VITE_LEDGER_DEPLOY_BLOCK`, `VITE_SETTLEMENT_SPENDER_ADDRESS`.
2. Deploy **ChocoGateway** (needs `VITE_LEDGER_ADDRESS`) → set `VITE_CKES_SWAP_CONTRACT_ADDRESS`.
3. Authorize ChocoGateway on ChocoLedger: `setSwapContract(gatewayAddress, true)`.
4. (Optional) Apply `supabase/schema.sql`; set `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`.

See `contracts/README.md` for the full deploy + authorization commands.

## Gas notes

- USDC fee-currency adapter (`0x2F25…602B`) is set as `feeCurrency` on every wallet write,
  so the user does not need CELO to sign.
- The exact-output path requires two wallet signatures: `approve` + `swapAndSendExact`.
- `logAttemptFor` on ChocoLedger is called internally by ChocoGateway, so the user signs
  only the swap transaction — the audit write is bundled into the same call.
