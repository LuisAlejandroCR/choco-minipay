# Choco contracts — security audit & remediation

**Scope:** `src/ChocoGateway.sol` (settlement + escrow) and `src/ChocoLedger.sol` (registry + audit log).
**Method:** 12-agent `pashov/skills` `solidity-auditor` sweep (math-precision, access-control, economic-security,
execution-trace, invariant, periphery, first-principles, asymmetry, boundary + the numerical-/trust-/flow-gap
hunters) cross-checked against a manual review, then deduped and severity-gated per the auditor's judging rules.
**Date:** 2026-06.

> **Live pair (immutable):** ChocoLedger `0x5A33C24eBF81fb215ee39f801D94895c8A7CE2C9`,
> ChocoGateway `0xcF4DC6118482C04ac25A95742202745aE7DB193E`. The fixes below land in source for the **next**
> `scripts/deploy-all.mjs` run; the live contracts cannot be patched in place.

## Verdict

**No Critical/High fund-theft path.** Locked USDC can only ever reach the ledger-specified recipient or the
owner; there is no withdraw/drain primitive. Findings cluster in **keeper/admin trust composition**,
**audit-log integrity**, and **accounting/observability**. The headline (Medium-High) was a *composition*:
`admin == keeper` + unbounded `lockFor` + mutable fee + no per-period settle guard → a compromised admin could
repeatedly pull a user's full standing USDC allowance. That composition is now broken (fixes M1 below).

---

## Applied fixes (this commit)

### M1 — Repeatable admin/keeper drain  → **fixed in `ChocoGateway.sol`**
- `onlyKeeper` is now **strict** (`msg.sender == keeper`, no `|| admin`): a compromised admin alone can no longer
  settle or lock. Admin still *rotates* the keeper via `setKeeper`.
- `setKeeper` adds `require(newKeeper != admin)` to keep the roles separated. (Aligned with `deploy-all.mjs`,
  which only calls `setKeeper` when `keeper != deployer`, so the guard never blocks a deploy.)
- `lockFor` **and** `fundRun` now load the schedule and enforce `s.owner == owner && s.active && !s.cancelled`
  and `usdcAmount <= s.sourceAmount` — no over-pull of a standing allowance, no orphaned locks.
- `settleScheduledRun` adds a **per-period guard**: `block.timestamp >= lastSettledAt[id] + MIN_SETTLE_INTERVAL`
  (27 days) and records `lastSettledAt[id]`. This kills the `settle → lockFor → settle` loop within a period.
  27 days sits just under the shortest real monthly gap (28-day February), so legitimate monthly runs pass.

### M2 — `recordSettlement` integrity → **fixed in `ChocoLedger.sol`**
- Removed the `_logAttempt` call: the gateway's `logAttemptFor` is now the **single** attempt-count path, so a
  settled run increments `totalTransactions` exactly once (no more double-log / counter malleability).
- Added idempotency: `require(block.timestamp >= lastSettlementAt[id] + MIN_SETTLE_INTERVAL)` — one receipt per
  period, so a replayed call can't spam the trail.
- The emitted `SettlementReceipt` now uses the schedule's **canonical** `sourceAsset`/`destinationAmount`
  (the keeper-supplied values for those two args are ignored), so a compromised keeper can't fabricate the
  delivered amount. Event ABI shape is unchanged → keeper + frontend parsing untouched.

### M3 — Admin lifecycle → **fixed in `ChocoLedger.sol`**
- Added `transferAdmin(address)` with a zero-address guard. The ledger previously had **no** admin transfer at
  all, so a lost admin key would permanently freeze `setKeeper` / `setSwapContract` / schedule controls.
- Added a zero-address guard to the ledger's `setKeeper` (matches the gateway's).

### M4 — `swapAndSend` zero slippage floor → **fixed in `ChocoGateway.sol`**
- `require(ckesMinOut > 0)`: forbids the `ckesMinOut == 0` path where a sandwich (or dust input) silently
  delivers ~0 KESm while the tx "succeeds". Scheduled settlement already enforces an on-chain exact-out amount.

**Compatibility verified:** the frontend funds with the same value it stores as `sourceAmount`
(`schedule.js` line 35/69/86), the keeper passes `schedule.sourceAmount` to `lockFor`/`recordSettlement`
(`choco-keeper.mjs`), and `deploy-all.mjs` sets a keeper distinct from the deployer — all pass the new guards.
Both contracts compile clean (`npm run build`).

---

## Full finding register (deduped, severity-gated)

| ID | Severity | Contract / fn | Finding | Status |
|----|----------|---------------|---------|--------|
| M1 | Med-High | Gateway: onlyKeeper/lockFor/settle | admin==keeper + unbounded lockFor + no per-period guard → repeatable allowance drain | **Fixed** |
| M2 | Medium | Ledger: recordSettlement | double-log, replayable, keeper-fabricated amounts | **Fixed** |
| M3 | Medium | Ledger: admin | no `transferAdmin` (freeze risk); no zero-addr guard on setKeeper | **Fixed** |
| M4 | Medium | Gateway: swapAndSend | `ckesMinOut == 0` → ~0 KESm on sandwich/dust, silent success | **Fixed** |
| L1 | Low | Gateway: _swapExactOut + swapAndSend | USDC→broker allowance not reset to 0 between swaps | **Fixed** |
| L2 | Low | Gateway: fee | fee mutable between lock & settle (rate staleness, liveness only) | Accepted |
| L3 | Low | Gateway: constructor | no `require(pool.token0()==ckes)`; no zero-addr guards on route args | **Fixed** |
| L4 | Low | Gateway: settle event | `usdmSpent` hard-coded `0` in the scheduled event (observability) | **Fixed** |
| L5 | Low | Gateway: quoteExactOut | returns `type(uint256).max` sentinel on a dry pool — frontend handles this | Accepted |
| L6 | Low | Both | no swap `deadline`; slot0 spot quote is view-only | Accepted (SwapRouter02 on Celo has no deadline field) |
| L7 | Low | Both: fields | `settlementSpender` + `maxRetries` are dead (never enforced) | **Fixed** — removed from struct, function, event + JS ABI/args |
| L8 | Low | Both: events | missing `AdminTransferred` / `setSwapContract` events; no two-step admin | **Fixed** (two-step admin deferred) |
| I1 | Info | Gateway: quote | fee rounds to 0 on dust; quote buffer (1%) < Mento slippage (1.5%) | **Fixed** — raised to 2% |
| I2 | Info | Ledger: interface | gateway interface `uint8 kind` vs ledger `AttemptKind` (benign, ABI-compat) | Accepted |

## Calibration — a multi-agent false positive (kept out of the register)

**"USDm-refund-revert DoS"** was independently raised by *four* lenses (execution-trace, first-principles,
asymmetry, boundary), each with a different proposed mechanism: a Safe token-Guard, an "ERC-20 reject hook",
and `receive() { revert() }`. **All three mechanisms are wrong.** A plain ERC-20 `transfer(to, amount)` runs
**no code on `to`** — there is no recipient hook (unlike ERC-777 or native value), so a contract recipient
cannot force the refund to revert. Only the **USDm token itself** (a global pause/blacklist) could, which Mento
USDm does not do per-address. → Not a live exploit. A `try/catch` / pull-payment on the surplus refund is still
worthwhile *defensive* hardening (future-proofs against a USDm pause) and is tracked as backlog, not a finding.
This is the run's clearest lesson: agreement across agents is not proof — the gating step caught a confident
4-lens consensus that was technically incorrect.

## Accepted (not fixed)

- **L2** — Fee is mutable between lock & settle (admin could raise fee after lock). A `feeAtLock` snapshot would fix it but adds storage per lock entry. Risk is low because admin == deployer, not keeper. Accepted.
- **L5** — `quoteExactOut` returns `type(uint256).max` on a dry pool. Correct sentinel; the frontend already guards `usdcAmountIn == type(uint256).max`. Accepted.
- **L6** — SwapRouter02 deployed on Celo has no `deadline` field (the comment at the top of the interface is accurate). Cannot be fixed without a different router. Accepted.
- **I2** — `uint8` in the gateway interface vs `AttemptKind` in the ledger: both ABI-encode identically, and the gateway hard-codes `0` (SUCCESS). Accepted.

## Remaining optional hardening

- `try/catch` the USDm surplus refund in `_swapExactOut` (defensive against a hypothetical USDm token-level pause — low probability, not a live exploit per the false-positive calibration above).
- Two-step admin pattern (pending confirmation on `newAdmin` before handoff takes effect) — useful if admin key management warrants it.
