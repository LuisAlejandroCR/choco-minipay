# Choco v2 contract backlog (redeploy required)

Security mitigations from the audit that need a **contract redeploy** — the live ChocoLedger
(`0x15659C181f31e5A463BcaB7E2cc706B0b336967C`) and ChocoGateway (`0x900F0c07b08483e860B4055892528dAE08eE56b3`)
are immutable.

> **STATUS — applied:** items **#1–#3 below are now in `contracts/src/ChocoLedger.sol` + `ChocoGateway.sol`**
> (both pass the "compiles without errors" test; no new test failures). The keeper has a **forward-compatible
> guard** so it works against both the live contracts and v2. Item **#4 is deferred** — Low/Info, the current
> code is correct for the deployed tokens (they return `bool`; the quote math is conservative), and rewriting
> the swap math carries regression risk best handled with fork tests.
>
> ⚠ **The repo source is now "v2 pending deploy" — it no longer matches the live on-chain bytecode.** The live
> contracts stay the OLD version until you run `deploy-all.mjs`, which **deploys straight to mainnet with no
> fork test**. Before deploying, run a **forked-mainnet test** of: settle, deliver-fallback (a reverting
> recipient), `refundRunFor`, and the 27-day guard. The snippets below are the record of what changed.

---

## 1. `refundRunFor` — operator rescue refund (audit H-2)
So locked USDC is never stranded if the owner can't act (abandoned wallet, or a schedule that can no longer
settle). Pays the **owner**, never the caller — the admin can't steal with it.

**ChocoGateway.sol** — add after `refundRun` (~line 266):
```solidity
/// @notice Admin-triggered refund of a plan's locked USDC to its OWNER (never the caller), so funds are
///         never stranded if the owner can't act. Pays the owner → admin cannot steal (audit H-2).
function refundRunFor(address owner, uint256 scheduleId) external onlyAdmin nonReentrant {
    uint256 amount = lockedOf[owner][scheduleId];
    if (amount == 0) revert NothingLocked();
    lockedOf[owner][scheduleId] = 0;
    require(usdc.transfer(owner, amount), "usdc refund");
    emit RunRefunded(owner, scheduleId, amount);
}
```

---

## 2. Deliver-then-transfer fallback (audit M-1)
A reverting/blacklisted recipient currently makes `settleScheduledRun` revert forever (locked USDC stuck).
Deliver KESm to the gateway, then push to the recipient; on failure, credit the payer.

**ChocoGateway.sol** — add event (after the events block, ~line 92):
```solidity
event DeliveryFellBack(address indexed intendedRecipient, address indexed creditedTo, uint256 ckesAmount);
```
Add helper (Internal section):
```solidity
function _safeCkesTransfer(address to, uint256 amount) internal returns (bool) {
    try ckes.transfer(to, amount) returns (bool ok) { return ok; }
    catch { return false; }
}
```
In `_swapExactOut`, change the `exactOutputSingle` recipient `recipient` → `address(this)` and add the push
(replace ~lines 310-313):
```solidity
    usdmSpent = router.exactOutputSingle(ISwapRouter02.ExactOutputSingleParams({
        tokenIn: address(usdm), tokenOut: address(ckes), fee: poolFee, recipient: address(this),
        amountOut: ckesExactOut, amountInMaximum: usdmReceived, sqrtPriceLimitX96: 0
    }));
    require(usdm.approve(address(router), 0), "usdm reset");
    // Push exact KESm to the recipient; if they can't receive (revert/blacklist), credit the payer so the
    // run is never permanently stuck (audit M-1). Delivery can be retried off-chain.
    if (!_safeCkesTransfer(recipient, ckesExactOut)) {
        require(ckes.transfer(refundTo, ckesExactOut), "ckes fallback");
        emit DeliveryFellBack(recipient, refundTo, ckesExactOut);
    }
```
(Optional: apply the same to `swapAndSend`'s `exactInputSingle` — lower priority, send-now has no lock to strand.)

---

## 3. Gateway-only settlement receipts (audit M-2, full fix)
Make the receipt fund-backed + atomic instead of keeper-asserted.

**ChocoLedger.sol** — add (alongside `logAttemptFor`):
```solidity
/// @notice Record a settlement receipt from an authorized gateway, ATOMIC with the fund movement — so it
///         can't be keeper-fabricated (audit M-2). Same once-per-period guard as recordSettlement.
function recordSettlementFor(uint256 id, uint256 sourceAmount, bytes32 settlementRef, string calldata note) external {
    require(authorizedSwapContracts[msg.sender], "not authorized");
    Schedule storage s = schedules[id];
    require(s.active && !s.cancelled, "inactive");
    require(block.timestamp >= lastSettlementAt[id] + MIN_SETTLE_INTERVAL, "too soon");
    lastSettlementAt[id] = uint64(block.timestamp);
    emit SettlementReceipt(id, true, s.sourceAsset, sourceAmount, s.destinationAmount, settlementRef, note);
}
```
**ChocoGateway.sol** — add `recordSettlementFor` to the `IChocoLedger` interface, then call it at the end of
`settleScheduledRun`:
```solidity
ledger.recordSettlementFor(scheduleId, netUsdc, bytes32(0), "gateway-settled");
```
**scripts/choco-keeper.mjs** — drop the separate `ledger.recordSettlement(...)` call; the gateway now emits the
receipt atomically. Keeper just calls `settleScheduledRun`.
> Trade-off: couples gateway→ledger and makes a ledger revert revert the whole settlement (atomic). Keep the
> gateway's existing `RunSettled` as the primary fund-backed event regardless.

---

## 4. SafeERC20 + FullMath (audit L-2, L-1 — hardening)
**ChocoGateway.sol** — return-data-tolerant token ops (in case Mento/Circle ever upgrade to non-standard tokens):
```solidity
function _safeCall(address token, bytes memory data) private {
    (bool ok, bytes memory ret) = token.call(data);
    require(ok && (ret.length == 0 || abi.decode(ret, (bool))), "erc20 op failed");
}
function _safeTransfer(IERC20 t, address to, uint256 v) private { _safeCall(address(t), abi.encodeWithSelector(t.transfer.selector, to, v)); }
function _safeTransferFrom(IERC20 t, address f, address to, uint256 v) private { _safeCall(address(t), abi.encodeWithSelector(t.transferFrom.selector, f, to, v)); }
function _safeApprove(IERC20 t, address sp, uint256 v) private { _safeCall(address(t), abi.encodeWithSelector(t.approve.selector, sp, v)); }
```
Then replace every `require(usdc.transfer(...))` / `transferFrom` / `approve` with the `_safe*` calls.

**FullMath for `_quoteForward`** (~lines 334-337) — remove the squared-truncation. Add
`import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";` and use `Math.mulDiv` for the inverse-sqrt
squaring. ⚠ Re-derive the scaling against the current (conservative, correct) `_quoteForward` before relying on
it — this only removes rounding, it must not change the result direction.

---

## Deploy / migrate checklist (when you do v2)
1. Implement the above in fresh `ChocoLedgerV2`/`ChocoGatewayV2` (non-upgradeable → new addresses).
2. `npm --prefix contracts test` + a **forked-mainnet** test of: settle, deliver-fallback (reverting recipient),
   `refundRunFor`, the 27-day guard.
3. Deploy (you hold the keys) → `setSwapContract(gatewayV2, true)` on the ledger + `setKeeper`.
4. Point the app + keeper env (`VITE_LEDGER_ADDRESS`, `VITE_SCHEDULE_ESCROW_ADDRESS`, `VITE_CKES_SWAP_CONTRACT_ADDRESS`)
   at the new addresses; migrate active schedules (users re-create, or a migration script).
5. Verify on Celoscan + Blockscout; update `contracts/AUDIT.md` and `contracts/README.md`.
