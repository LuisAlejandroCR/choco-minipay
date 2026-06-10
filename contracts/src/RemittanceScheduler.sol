// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal ERC-20 surface used by the scheduler.
interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/// @notice Mento V2 Broker — swaps stablecoins at oracle-backed rates (no thin-AMM slippage).
interface IMentoBroker {
    function swapIn(
        address exchangeProvider,
        bytes32 exchangeId,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOutMin
    ) external returns (uint256 amountOut);
}

/// @title RemittanceScheduler
/// @notice On-chain recurring USDC -> cKES remittances on Celo (allowance / pull model).
///
/// Flow:
///   1. Payer grants this contract a USDC allowance (one `approve` tx).
///   2. Payer calls `createSchedule(...)` — the schedule lives entirely on-chain (no DB).
///   3. A permissionless keeper calls `executeDue(id, ...)` on/after each due date.
///      The contract pulls exactly the scheduled USDC, swaps USDC -> USDm -> cKES via the
///      Mento Broker, and sends cKES to the recipient. No idle custody: funds only pass
///      through during a single `executeDue` call.
///
/// Mento has no direct USDC/cKES pool, so the swap is two oracle-priced hops. Slippage
/// floors (`minUsdmOut`, `minCkesOut`) are supplied by the keeper, computed off-chain from
/// a fresh quote and cross-checked against the SortedOracles median (see services/worker).
///
/// SECURITY: experimental, unaudited. `executeDue` is permissionless but funds can only ever
/// move from a schedule's owner to that schedule's predefined recipient, so an external caller
/// can at most trigger the transfer the owner already authorized (and pays the gas to do so).
/// Audit before mainnet launch with real user funds.
contract RemittanceScheduler {
    struct Schedule {
        address owner;       // payer (granted the USDC allowance)
        address recipient;   // receives cKES
        uint256 usdcAmount;  // USDC pulled per run (6 decimals)
        uint64 interval;     // seconds between runs (e.g. ~2_592_000 for 30 days)
        uint64 nextRun;      // unix time of the next eligible run
        bool active;
    }

    // --- Immutable Mento config (verified Celo mainnet values via scripts/probe-mento.mjs) ---
    IMentoBroker public immutable broker;
    address public immutable exchangeProvider; // BiPoolManager
    address public immutable usdc;
    address public immutable usdm;
    address public immutable ckes;
    bytes32 public immutable usdcToUsdm;
    bytes32 public immutable usdmToCkes;

    uint256 public nextScheduleId;
    mapping(uint256 => Schedule) public schedules;

    uint256 private _lock; // minimal reentrancy guard

    event ScheduleCreated(
        uint256 indexed id, address indexed owner, address indexed recipient,
        uint256 usdcAmount, uint64 interval, uint64 firstRun
    );
    event ScheduleCancelled(uint256 indexed id);
    event TransferExecuted(
        uint256 indexed id, address indexed owner, address indexed recipient,
        uint256 usdcIn, uint256 ckesOut, uint64 nextRun
    );

    modifier nonReentrant() {
        require(_lock == 0, "reentrant");
        _lock = 1;
        _;
        _lock = 0;
    }

    constructor(
        address _broker,
        address _exchangeProvider,
        address _usdc,
        address _usdm,
        address _ckes,
        bytes32 _usdcToUsdm,
        bytes32 _usdmToCkes
    ) {
        broker = IMentoBroker(_broker);
        exchangeProvider = _exchangeProvider;
        usdc = _usdc;
        usdm = _usdm;
        ckes = _ckes;
        usdcToUsdm = _usdcToUsdm;
        usdmToCkes = _usdmToCkes;
    }

    /// @notice Create a recurring remittance. Caller is the payer and must separately
    /// `approve` this contract for USDC (at least `usdcAmount` per run).
    function createSchedule(address recipient, uint256 usdcAmount, uint64 interval, uint64 firstRun)
        external
        returns (uint256 id)
    {
        require(recipient != address(0), "bad recipient");
        require(usdcAmount > 0, "bad amount");
        require(interval > 0, "bad interval");
        uint64 nowTs = uint64(block.timestamp);
        uint64 start = firstRun < nowTs ? nowTs : firstRun;
        id = ++nextScheduleId;
        schedules[id] = Schedule(msg.sender, recipient, usdcAmount, interval, start, true);
        emit ScheduleCreated(id, msg.sender, recipient, usdcAmount, interval, start);
    }

    function cancelSchedule(uint256 id) external {
        Schedule storage s = schedules[id];
        require(s.owner == msg.sender, "not owner");
        s.active = false;
        emit ScheduleCancelled(id);
    }

    /// @notice Execute a due schedule: pull USDC, swap USDC -> USDm -> cKES, send to recipient.
    /// @param minUsdmOut slippage floor for hop 1 (keeper-computed, oracle cross-checked).
    /// @param minCkesOut slippage floor for hop 2 (keeper-computed, oracle cross-checked).
    function executeDue(uint256 id, uint256 minUsdmOut, uint256 minCkesOut)
        external
        nonReentrant
        returns (uint256 ckesOut)
    {
        Schedule storage s = schedules[id];
        require(s.active, "inactive");
        require(block.timestamp >= s.nextRun, "not due");

        // Effects before interactions: advance the clock first so a re-entrant token
        // callback can't double-spend. No catch-up — missed periods are skipped, not stacked.
        s.nextRun = uint64(block.timestamp) + s.interval;

        uint256 amountIn = s.usdcAmount;
        address owner_ = s.owner;
        address recipient_ = s.recipient;

        // Pull exactly the scheduled USDC from the payer (requires their allowance).
        _check(IERC20(usdc).transferFrom(owner_, address(this), amountIn), "usdc pull failed");

        // Hop 1: USDC -> USDm
        _check(IERC20(usdc).approve(address(broker), amountIn), "usdc approve failed");
        uint256 usdmOut = broker.swapIn(exchangeProvider, usdcToUsdm, usdc, usdm, amountIn, minUsdmOut);

        // Hop 2: USDm -> cKES
        _check(IERC20(usdm).approve(address(broker), usdmOut), "usdm approve failed");
        ckesOut = broker.swapIn(exchangeProvider, usdmToCkes, usdm, ckes, usdmOut, minCkesOut);

        // Deliver cKES to the recipient.
        _check(IERC20(ckes).transfer(recipient_, ckesOut), "ckes send failed");

        emit TransferExecuted(id, owner_, recipient_, amountIn, ckesOut, s.nextRun);
    }

    function _check(bool ok, string memory err) private pure {
        require(ok, err);
    }
}
