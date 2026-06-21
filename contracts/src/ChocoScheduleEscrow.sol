// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/// @dev The live send-now swap (ChocoUniV3CkesSwap): USDC -> USDm (Mento) -> KESm (Uniswap V3),
///      true exact-output — delivers exactly `ckesExactOut` to `recipient` and refunds the unused
///      USDC to the caller (this escrow). Same ABI the frontend already uses.
interface IChocoSwap {
    function swapAndSendExact(address recipient, uint256 usdcAmountIn, uint256 ckesExactOut)
        external
        returns (uint256 ckesAmountOut);
}

/// @title ChocoScheduleEscrow
/// @notice Reserves ("locks") one run's USDC per scheduled plan so the money cannot be spent
///         before the keeper settles it — eliminating the insufficient-funds failure at run time.
///         Funds are escrowed one run at a time: the owner locks the next run, the keeper settles
///         it through the live UniV3 swap, and the surplus from the swap's exact-out buffer is
///         returned to the owner. The owner can reclaim a locked run at any time (cancel/pause).
///         The contract never swaps itself — it delegates to ChocoUniV3CkesSwap and only custodies
///         USDC, keeping the audit surface small.
contract ChocoScheduleEscrow {
    IERC20     public immutable usdc;   // 6 decimals
    IChocoSwap public immutable swap;   // ChocoUniV3CkesSwap (USDC -> KESm, exact-out)

    address public admin;
    address public keeper;              // off-chain settlement worker (matches ChocoLedger keeper)

    // owner => scheduleId => USDC reserved for the next run (6 decimals)
    mapping(address => mapping(uint256 => uint256)) public lockedOf;

    event RunLocked(address indexed owner, uint256 indexed scheduleId, uint256 usdcAmount, address indexed fundedBy);
    event RunSettled(address indexed owner, uint256 indexed scheduleId, address recipient, uint256 usdcSpent, uint256 ckesOut, uint256 refundUsdc);
    event RunRefunded(address indexed owner, uint256 indexed scheduleId, uint256 usdcAmount);
    event KeeperUpdated(address indexed keeper);

    error ZeroAmount();
    error NothingLocked();
    error AlreadyLocked();

    uint256 private _entered;
    modifier nonReentrant() {
        require(_entered == 0, "reentrant");
        _entered = 1;
        _;
        _entered = 0;
    }
    modifier onlyAdmin() { require(msg.sender == admin, "not admin"); _; }
    modifier onlyKeeper() { require(msg.sender == keeper || msg.sender == admin, "not keeper"); _; }

    constructor(address usdcAddress, address swapAddress, address keeperAddress) {
        require(usdcAddress != address(0) && swapAddress != address(0) && keeperAddress != address(0), "bad arg");
        usdc   = IERC20(usdcAddress);
        swap   = IChocoSwap(swapAddress);
        admin  = msg.sender;
        keeper = keeperAddress;
        emit KeeperUpdated(keeperAddress);
    }

    // ─── Admin ───────────────────────────────────────────────────────────────

    function setKeeper(address newKeeper) external onlyAdmin {
        require(newKeeper != address(0), "bad keeper");
        keeper = newKeeper;
        emit KeeperUpdated(newKeeper);
    }

    function transferAdmin(address newAdmin) external onlyAdmin {
        require(newAdmin != address(0), "bad admin");
        admin = newAdmin;
    }

    // ─── Locking (one run at a time) ───────────────────────────────────────────

    /// @notice Owner locks the next run's USDC for their plan. The escrow custodies it until the
    ///         keeper settles or the owner reclaims it. Reverts if a run is already locked for this
    ///         plan (one run at a time) — settle or refund the existing lock first.
    function fundRun(uint256 scheduleId, uint256 usdcAmount) external nonReentrant {
        if (usdcAmount == 0) revert ZeroAmount();
        if (lockedOf[msg.sender][scheduleId] != 0) revert AlreadyLocked();
        require(usdc.transferFrom(msg.sender, address(this), usdcAmount), "usdc pull");
        lockedOf[msg.sender][scheduleId] = usdcAmount;
        emit RunLocked(msg.sender, scheduleId, usdcAmount, msg.sender);
    }

    /// @notice Keeper-driven lock for the *next* run, pulling from the owner's wallet (requires the
    ///         owner's standing USDC allowance to this escrow). Used to auto-reserve next month's run
    ///         right after the current one settles. If the owner lacks funds/allowance this reverts
    ///         and the app surfaces a "top up to keep your plan running" notice — the just-settled
    ///         run is unaffected.
    function lockFor(address owner, uint256 scheduleId, uint256 usdcAmount) external onlyKeeper nonReentrant {
        if (usdcAmount == 0) revert ZeroAmount();
        if (lockedOf[owner][scheduleId] != 0) revert AlreadyLocked();
        require(usdc.transferFrom(owner, address(this), usdcAmount), "usdc pull");
        lockedOf[owner][scheduleId] = usdcAmount;
        emit RunLocked(owner, scheduleId, usdcAmount, msg.sender);
    }

    // ─── Settlement ────────────────────────────────────────────────────────────

    /// @notice Keeper settles a locked run: swaps the reserved USDC to exactly `ckesExactOut` KESm
    ///         for `recipient` via the UniV3 swap, then returns the swap's USDC surplus to the owner.
    ///         The keeper records the ChocoLedger SettlementReceipt separately (unchanged history).
    function settleRun(
        address owner,
        uint256 scheduleId,
        address recipient,
        uint256 ckesExactOut
    ) external onlyKeeper nonReentrant returns (uint256 ckesOut) {
        require(recipient != address(0), "bad recipient");
        if (ckesExactOut == 0) revert ZeroAmount();
        uint256 amount = lockedOf[owner][scheduleId];
        if (amount == 0) revert NothingLocked();

        // Effects before interactions (the swap is an external call).
        lockedOf[owner][scheduleId] = 0;

        uint256 balanceBefore = usdc.balanceOf(address(this));
        require(usdc.approve(address(swap), amount), "usdc approve");
        // Delivers exactly ckesExactOut to recipient; refunds unused USDC back to this escrow.
        ckesOut = swap.swapAndSendExact(recipient, amount, ckesExactOut);
        require(usdc.approve(address(swap), 0), "usdc reset"); // clear residual allowance

        // refund = unused USDC the swap returned to the escrow for this run.
        uint256 balanceAfter = usdc.balanceOf(address(this));
        uint256 refundUsdc = balanceAfter + amount > balanceBefore ? balanceAfter + amount - balanceBefore : 0;
        if (refundUsdc > 0) require(usdc.transfer(owner, refundUsdc), "usdc refund");

        emit RunSettled(owner, scheduleId, recipient, amount - refundUsdc, ckesOut, refundUsdc);
    }

    // ─── Reclaim ─────────────────────────────────────────────────────────────

    /// @notice Owner reclaims a locked run (e.g. when cancelling or pausing the plan).
    function refundRun(uint256 scheduleId) external nonReentrant {
        uint256 amount = lockedOf[msg.sender][scheduleId];
        if (amount == 0) revert NothingLocked();
        lockedOf[msg.sender][scheduleId] = 0;
        require(usdc.transfer(msg.sender, amount), "usdc refund");
        emit RunRefunded(msg.sender, scheduleId, amount);
    }
}
