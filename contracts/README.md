# Choco Contracts — Celo Mainnet

Smart contracts powering Choco remittances on Celo. No contract holds user funds between calls.

## Contract Architecture

```
──── Send now ────────────────────────────────────────────────────────────

User wallet
    │  approve(ChocoGateway, quoteExactOut(ckesExact))
    │  swapAndSendExact(recipient, usdcAmount, ckesExact)
    ▼
┌─────────────────────────────────────────────────────┐
│  ChocoGateway                                       │
│  · Deducts protocol fee (0.25%) → feeRecipient      │
│  · Swaps USDC → USDm (Mento) → KESm (Uniswap V3)   │
│  · Delivers exactly ckesExact KESm to recipient     │
│  · Surplus USDC returned to sender                  │
│  · Calls ChocoLedger.logAttemptFor(payer, ...)      │
└────────────────────────────────────────────────────┘

──── Scheduled payment ───────────────────────────────────────────────────

User wallet
    │  approve(ChocoGateway, sourceAmount)
    │  createAndFundSchedule(...)  ← single signature: creates plan + locks first run
    ▼
ChocoGateway.lockFor(owner, scheduleId, usdcAmount)
    · Holds one month's USDC in lockedOf[owner][scheduleId]
    · Writes schedule to ChocoLedger

On settlement day — Keeper calls:
    ChocoGateway.settleScheduledRun(scheduleId)
    · Reads recipient + amount from ChocoLedger (keeper can't redirect)
    · Swaps locked USDC → KESm → recipient
    · Calls ChocoLedger.logAttemptFor() + recordSettlementFor() [v2: atomic]
    · Re-locks next month's run from owner's standing allowance

──── Shared ledger ───────────────────────────────────────────────────────

┌─────────────────────────────────────────────────────┐
│  ChocoLedger                                        │
│  · MonthlyScheduleCreated — user authorizes a plan  │
│  · SchedulePaused / ScheduleResumed / Cancelled     │
│  · SettlementReceipt — keeper or gateway receipt    │
│  · AttemptLogged — every send-now + settlement      │
│  · totalTransactions() — unified counter            │
└─────────────────────────────────────────────────────┘
```

### Active contracts

| Contract | Active address | Deploy block | Purpose | Deploy script |
|---|---|---:|---|---|
| **ChocoGateway** | `0x900F0c07b08483e860B4055892528dAE08eE56b3` | 70322683 | Fee collection, USDC→KESm swap, on-chain tx storage | `deploy:gateway` |
| **ChocoLedger** | `0x15659C181f31e5A463BcaB7E2cc706B0b336967C` | 70322672 | Unified history: schedules + settlements + send-now audit | `deploy:ledger` |

### Legacy contracts (do not redeploy)

| Contract | Superseded by |
|---|---|
| `ChocoCkesSwap` | `ChocoGateway` |
| `ChocoScheduleRegistry` | `ChocoLedger` |
| `ChocoAuditLog` | `ChocoLedger` |

---

## Quick start

```bash
cd contracts
npm install
```

Set env vars (PowerShell):

```powershell
$env:DEPLOYER_PRIVATE_KEY  = "0x..."          # wallet that pays deploy gas (~7 CELO needed)
$env:KEEPER_ADDRESS        = "0x..."          # executor EOA that will run monthly settlements
$env:FEE_RECIPIENT_ADDRESS = "0x..."          # wallet that receives the protocol fee
$env:FEE_BPS               = "25"             # 25 = 0.25%; range 0–100
$env:CELO_RPC_URL          = "https://forno.celo.org"
```

### Deploy order

**Step 1 — ChocoLedger** (must come first; Gateway wires into it)

```bash
npm run deploy:ledger
```

Prints:
```
VITE_LEDGER_ADDRESS=0x...
VITE_LEDGER_DEPLOY_BLOCK=...
VITE_SETTLEMENT_SPENDER_ADDRESS=0x...
```

**Step 2 — ChocoGateway**

```powershell
$env:VITE_LEDGER_ADDRESS = "<from step 1>"
npm run deploy:gateway
```

Prints:
```
VITE_CKES_SWAP_CONTRACT_ADDRESS=0x...
VITE_CKES_SWAP_DEPLOY_BLOCK=...
```

Use `VITE_CKES_SWAP_CONTRACT_ADDRESS` for the active gateway that signs new send-now
transactions. If you deployed earlier gateways during testing, keep them in
`VITE_CKES_SWAP_CONTRACT_ADDRESSES` so the frontend can rebuild old and new movements from
events.

Also prints the `cast send` command to authorize ChocoGateway on ChocoLedger — run it before going live.

**Step 3 — Authorize ChocoGateway on ChocoLedger**

```bash
cast send <LEDGER_ADDRESS> "setSwapContract(address,bool)" <GATEWAY_ADDRESS> true \
  --rpc-url https://forno.celo.org \
  --private-key $DEPLOYER_PRIVATE_KEY
```

Or use Celoscan → Write Contract → `setSwapContract`.

---

## Frontend env vars

Add to Vercel (or `.env.local` for local dev):

```bash
# Active
VITE_LEDGER_ADDRESS=0x15659C181f31e5A463BcaB7E2cc706B0b336967C
VITE_LEDGER_DEPLOY_BLOCK=70322672
VITE_SETTLEMENT_SPENDER_ADDRESS=0x900F0c07b08483e860B4055892528dAE08eE56b3   # active ChocoGateway spender
VITE_CKES_SWAP_CONTRACT_ADDRESS=0x900F0c07b08483e860B4055892528dAE08eE56b3   # points to ChocoGateway
VITE_CKES_SWAP_DEPLOY_BLOCK=70322683         # active gateway deploy block
VITE_CKES_SWAP_CONTRACT_ADDRESSES=0x900F0c07b08483e860B4055892528dAE08eE56b3,0x8271442a1a902c69415657926FDe8ae277dD2255
VITE_FEE_CURRENCY_ADDRESS=0x...         # Celo fee currency (cUSD or native)

# Fee config (informational; actual values are in the deployed Gateway)
FEE_RECIPIENT_ADDRESS=0x...
FEE_BPS=25
```

---

## ChocoGateway — developer reference

> **v2 source applied, redeploy pending.** The `contracts/src/` files now include `refundRunFor`,
> `_safeCkesTransfer`/`DeliveryFellBack`, and the `recordSettlementFor` call at the end of
> `settleScheduledRun`. The live contract at `0x900F0c…` matches the pre-v2 source.
> See `V2_BACKLOG.md` for the full diff.

### Send-now functions

```solidity
// Reverse quote: USDC the caller must approve to guarantee recipient gets exactly ckesExactOut.
// Includes the protocol fee and the exact-output slippage buffer.
function quoteExactOut(uint256 ckesExactOut) external view returns (uint256 usdcAmountIn);

// Fixed-output: recipient receives exactly ckesExactOut KESm; surplus USDC returned to sender.
// Call quoteExactOut first → approve that USDC amount → call this.
function swapAndSendExact(address recipient, uint256 usdcAmountIn, uint256 ckesExactOut)
    external returns (uint256 ckesAmountOut);

// Legacy fixed-input (delivers whatever KESm the swap produces — less predictable for recipient)
function swapAndSend(address recipient, uint256 usdcAmountIn, uint256 ckesMinOut)
    external returns (uint256 ckesAmountOut);
```

### Scheduled-payment (escrow) functions

```solidity
// Lock one run's USDC from owner's wallet for the given schedule — requires prior ERC-20 approval.
// Called by the app at plan creation and auto-re-locked by the keeper after each settlement.
function lockFor(address owner, uint256 scheduleId, uint256 usdcAmount) external;

// Create a schedule on ChocoLedger AND lock the first run's USDC in one user signature.
function createAndFundSchedule(...) external returns (uint256 scheduleId);

// Keeper-only: execute a due schedule. Reads recipient + amount from the ledger (can't redirect).
// Returns netUsdc actually swapped. Auto-calls ChocoLedger.recordSettlementFor in v2.
function settleScheduledRun(uint256 scheduleId) external returns (uint256 netUsdc);

// Owner self-refund: return a locked run's USDC without cancelling the schedule.
function refundRun(uint256 scheduleId) external;

// Admin rescue refund: return a locked run to its OWNER (never to the caller). Audit H-2.
// v2 only — not present in the current live contract.
function refundRunFor(address owner, uint256 scheduleId) external;  // onlyAdmin, v2

// Read how much USDC is locked for a given owner + schedule.
function lockedOf(address owner, uint256 scheduleId) external view returns (uint256);
```

### Admin functions

```solidity
function setKeeper(address nextKeeper) external;           // onlyAdmin; keeper != admin enforced
function setFee(address newFeeRecipient, uint16 newFeeBps) external; // capped at 100 bps (1%)
function transferAdmin(address newAdmin) external;
```

### Key events

```solidity
// Send-now swap (read by history reader for movement feed)
event UsdcToCkesSwap(address indexed payer, uint256 usdcIn, uint256 usdmMid, uint256 ckesOut, uint256 ckesMinOut);

// Scheduled run executed: fund-backed settlement receipt
event RunSettled(uint256 indexed scheduleId, address indexed owner, uint256 netUsdc, uint256 ckesOut);

// Owner or keeper refunded a locked run
event RunRefunded(address indexed owner, uint256 indexed scheduleId, uint256 usdcAmount);

// v2: KESm could not be delivered to the intended recipient — credited to the payer instead
event DeliveryFellBack(address indexed intendedRecipient, address indexed creditedTo, uint256 ckesAmount);
```

### Fee model

```
usdcAmountIn  ──► feeUsdc = usdcAmountIn × feeBps / 10000  ──► feeRecipient
              └─► netUsdc = usdcAmountIn − feeUsdc          ──► Mento Broker → KESm → recipient
```

Default: `feeBps = 25` → **0.25%**. Admin can adjust via `setFee()` without redeploying (capped at 1% in the contract).

---

## ChocoLedger — developer reference

### Key functions

```solidity
// Schedule management (called by user wallet)
function createMonthlySchedule(...) external returns (uint256 id);
function pauseSchedule(uint256 id) external;
function resumeSchedule(uint256 id) external;
function cancelSchedule(uint256 id) external;

// Keeper-only: record a settled payment and auto-log to audit trail
function recordSettlement(uint256 id, bool success, ...) external;

// Authorized swap contracts only: log a send-now on behalf of the real payer
function logAttemptFor(address payer, uint8 kind, address recipient, uint256 usdcAmount, uint256 ckesAmount, string calldata note) external returns (uint256);

// v2 — Gateway-only atomic receipt: records settlement AND emits SettlementReceipt in the
// same tx as the fund movement; can't be keeper-fabricated. Same 27-day guard as recordSettlement.
function recordSettlementFor(uint256 id, uint256 sourceAmount, bytes32 settlementRef, string calldata note) external;

// Admin: register/deregister an authorized swap contract
function setSwapContract(address swapContract, bool authorized) external;

// Admin: transfer ledger ownership (required after deploy — move to Safe)
function transferAdmin(address newAdmin) external;

// Views
function totalTransactions() external view returns (uint256);
function getSchedule(uint256 id) external view returns (Schedule memory);
function getAttempt(uint256 attemptId) external view returns (AuditEntry memory);
function getAttemptsBySender(address sender) external view returns (uint256[] memory);
```

### Events (all visible on Celoscan)

| Event | Emitted by | When |
|---|---|---|
| `MonthlyScheduleCreated` | user | `createMonthlySchedule` |
| `SchedulePaused` | user or admin | `pauseSchedule` |
| `ScheduleResumed` | user or admin | `resumeSchedule` |
| `ScheduleCancelled` | user or admin | `cancelSchedule` |
| `SettlementReceipt` | keeper/executor | `recordSettlement` |
| `AttemptLogged` | Gateway (via `logAttemptFor`) or keeper | every send-now + settlement |

### AttemptKind enum

```solidity
enum AttemptKind { SUCCESS, FAILED_SWAP, FAILED_TRANSFER, INSUFFICIENT_FUNDS, REJECTED }
```

---

## Reading history with viem

```js
// All send-now swaps by a wallet
const swapLogs = await publicClient.getLogs({
  address: GATEWAY_ADDRESS,
  event: parseAbiItem('event UsdcToCkesSwap(address indexed payer, uint256 usdcIn, uint256 usdmMid, uint256 ckesOut, uint256 ckesMinOut)'),
  args: { payer: walletAddress },
  fromBlock: BigInt(DEPLOY_BLOCK),
});

// All schedule creations
const scheduleLogs = await publicClient.getLogs({
  address: LEDGER_ADDRESS,
  event: parseAbiItem('event MonthlyScheduleCreated(uint256 indexed id, address indexed owner, ...)'),
  args: { owner: walletAddress },
  fromBlock: BigInt(LEDGER_DEPLOY_BLOCK),
});

// Unified audit trail for a wallet (send-now + settlements)
const ids = await publicClient.readContract({
  address: LEDGER_ADDRESS,
  abi: LEDGER_ABI,
  functionName: 'getAttemptsBySender',
  args: [walletAddress],
});
```

---

## Security notes

- `.env` is gitignored — never commit private keys
- `ChocoGateway` holds USDC only while a schedule run is locked (`lockedOf`); the sum of all active locks equals the gateway balance — anything extra is a bug
- `settleScheduledRun` reads recipient + amount from ChocoLedger — the keeper can trigger but never redirect a payment
- `logAttemptFor` and `recordSettlementFor` are gated by `authorizedSwapContracts` — only registered Gateway addresses can write on behalf of payers
- `setFee` is capped at 100 bps (1%) in the contract; no admin can set a higher fee without redeploying
- `admin != keeper` is enforced in `setKeeper` — the two roles can't be collapsed into one key
- `refundRunFor` (v2) pays the schedule **owner**, never the caller — admin cannot steal locked funds
- After deploy, call `transferAdmin(safeAddress)` on both contracts to move admin to a multisig
- Verify deployed bytecode on [Celoscan](https://celoscan.io/) after every deploy
- Full audit findings and off-chain mitigations: `contracts/AUDIT.md`
