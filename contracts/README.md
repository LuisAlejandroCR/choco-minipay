# Choco Contracts — Celo Mainnet

Smart contracts powering Choco remittances on Celo. No contract holds user funds between calls.

## Contract Architecture

```
User wallet
    │
    │  approve(ChocoGateway, quoteExactOut(ckesExact))   ← exact-output path (default)
    │  swapAndSendExact(recipient, usdcAmount, ckesExact)
    ▼
┌─────────────────────────────────────────────────────┐
│  ChocoGateway                                       │
│  · Deducts protocol fee (default 0.25%) → feeWallet │
│  · Swaps USDC → USDm → KESm via Mento Broker        │
│  · Delivers KESm directly to recipient              │
│  · Stores TxRecord on-chain (queryable)             │
│  · Calls ChocoLedger.logAttemptFor()                │
└──────────────┬──────────────────────────────────────┘
               │ logAttemptFor(payer, ...)
               ▼
┌─────────────────────────────────────────────────────┐
│  ChocoLedger                                        │
│  · AttemptLogged  — every send-now (via Gateway)    │
│  · MonthlyScheduleCreated — user authorizes a plan   │
│  · SchedulePaused / ScheduleResumed — user control   │
│  · SettlementReceipt — executor runs monthly pay     │
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

### Key functions

```solidity
// Quote KESm output after fee deduction (use for ckesMinOut calculation)
function quote(uint256 usdcAmountIn) external view returns (uint256 ckesAmountOut);

// Full breakdown: KESm out + fee in USDC + net USDC entering the swap
function quoteWithFee(uint256 usdcAmountIn) external view
    returns (uint256 ckesAmountOut, uint256 feeUsdc, uint256 swapUsdc);

// Reverse quote: USDC the caller must approve to guarantee recipient gets exactly ckesExactOut
// Includes the protocol fee and 1% slippage buffer; pair with swapAndSendExact
function quoteExactOut(uint256 ckesExactOut) external view returns (uint256 usdcAmountIn);

// Fixed-input entry point (legacy) — delivers whatever KESm the swap produces
function swapAndSend(address recipient, uint256 usdcAmountIn, uint256 ckesMinOut)
    external returns (uint256 ckesAmountOut);

// Fixed-output entry point — recipient receives exactly ckesExactOut; surplus returned to sender
// Call quoteExactOut first to get usdcAmountIn, then approve that amount before calling
function swapAndSendExact(address recipient, uint256 usdcAmountIn, uint256 ckesExactOut)
    external returns (uint256 ckesAmountOut);

// Query a single transaction by its sequential ID
function getTx(uint256 txId) external view returns (TxRecord memory);

// All tx IDs for a given payer wallet
function getTxsByPayer(address payer) external view returns (uint256[] memory);

// Cumulative protocol fee earned (USDC, 6 decimals)
function totalFeeEarned() external view returns (uint256);

// Admin: update fee config (capped at 1%)
function setFee(address newFeeRecipient, uint16 newFeeBps) external;

// Admin: transfer contract ownership
function transferAdmin(address newAdmin) external;
```

### TxRecord struct

```solidity
struct TxRecord {
    address payer;       // wallet that called swapAndSend
    address recipient;   // KESm destination
    uint256 usdcIn;      // full USDC pulled from payer (6 decimals)
    uint256 feeUsdc;     // protocol fee deducted before swap (6 decimals)
    uint256 ckesOut;     // KESm delivered to recipient (18 decimals)
    uint64  timestamp;   // block.timestamp at execution
}
```

### Events

```solidity
// Backwards-compatible — read by celo.js history reader
event UsdcToCkesSwap(address indexed payer, uint256 usdcIn, uint256 usdmMid, uint256 ckesOut, uint256 ckesMinOut);

// Rich event for analytics and Celoscan visibility
event SwapRecorded(uint256 indexed txId, address indexed payer, address indexed recipient, uint256 usdcIn, uint256 feeUsdc, uint256 ckesOut);

// Emitted when admin changes fee config
event FeeUpdated(address indexed feeRecipient, uint16 feeBps);
```

### Fee model

```
usdcAmountIn  ──► feeUsdc = usdcAmountIn × feeBps / 10000  ──► feeRecipient
              └─► swapUsdc = usdcAmountIn - feeUsdc         ──► Mento Broker
```

Default: `feeBps = 25` → **0.25%** (~10× cheaper than Western Union, in line with Wise).
Admin can adjust at any time via `setFee()` without redeploying.

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

// Admin: register/deregister an authorized swap contract
function setSwapContract(address swapContract, bool authorized) external;

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
- `ChocoGateway` holds no funds between calls; any USDC/KESm balance after a tx is a bug
- `logAttemptFor` is gated by `authorizedSwapContracts` — only registered Gateway addresses can write on behalf of payers
- `setFee` is capped at 100 bps (1%) in the contract; no admin can set a higher fee without redeploying
- Verify deployed bytecode on [Celoscan](https://celoscan.io/) after every deploy
- Deploy cost: ~0.1 CELO per contract
