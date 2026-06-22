// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

interface IMentoBroker {
    function getAmountOut(address provider, bytes32 id, address tokenIn, address tokenOut, uint256 amountIn)
        external view returns (uint256);
    function swapIn(address provider, bytes32 id, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOutMin)
        external returns (uint256);
}

interface IUniswapV3Pool {
    function slot0() external view returns (
        uint160 sqrtPriceX96, int24 tick, uint16 obsIndex, uint16 obsCard, uint16 obsCardNext, uint8 feeProtocol, bool unlocked
    );
}

// SwapRouter02 (Celo) — V2 structs, NO deadline field.
interface ISwapRouter02 {
    struct ExactInputSingleParams {
        address tokenIn; address tokenOut; uint24 fee; address recipient;
        uint256 amountIn; uint256 amountOutMinimum; uint160 sqrtPriceLimitX96;
    }
    function exactInputSingle(ExactInputSingleParams calldata p) external returns (uint256 amountOut);

    struct ExactOutputSingleParams {
        address tokenIn; address tokenOut; uint24 fee; address recipient;
        uint256 amountOut; uint256 amountInMaximum; uint160 sqrtPriceLimitX96;
    }
    function exactOutputSingle(ExactOutputSingleParams calldata p) external returns (uint256 amountIn);
}

interface IChocoLedger {
    struct Schedule {
        address owner; address recipient; address settlementSpender; address sourceAsset;
        uint256 sourceAmount; uint256 destinationAmount; uint8 dayOfMonth; uint8 maxRetries;
        uint64 firstRunAt; bool active; bool cancelled; bytes32 commandHash; bytes32 receiptLabelHash;
    }
    function getSchedule(uint256 id) external view returns (Schedule memory);
    function logAttemptFor(
        address payer, uint8 kind, address recipientWallet, uint256 usdcAmount, uint256 ckesAmount, string calldata note
    ) external returns (uint256);
}

/// @title ChocoGateway
/// @notice The single Choco settlement gateway: USDC -> USDm (Mento) -> KESm (Uniswap V3), true
///         exact-output delivery, protocol fee, ChocoLedger logging — plus held funds for scheduled
///         plans. Reserves ("holds") one run's USDC per plan so a scheduled transfer can't fail on
///         insufficient funds, and settles it by reading the canonical recipient/amount straight
///         from the ChocoLedger schedule, so the keeper can only trigger a run, never redirect it.
contract ChocoGateway {
    // --- Route (immutable) ---------------------------------------------------
    IMentoBroker  public immutable broker;
    address       public immutable exchangeProvider;
    bytes32       public immutable usdcToUsdmId;     // Mento USDC<->USDm exchange
    ISwapRouter02 public immutable router;
    IUniswapV3Pool public immutable pool;            // USDm/KESm pool (for quoteExactOut slot0)
    uint24        public immutable poolFee;
    IERC20        public immutable usdc;             // 6 dec
    IERC20        public immutable usdm;             // 18 dec
    IERC20        public immutable ckes;             // 18 dec
    IChocoLedger  public immutable ledger;

    // --- Admin (mutable) -----------------------------------------------------
    address public admin;
    address public keeper;
    address public feeRecipient;
    uint16  public feeBps;                            // max 1000 (10%)

    // --- Held funds: owner => scheduleId => USDC reserved for the next run ----
    mapping(address => mapping(uint256 => uint256)) public lockedOf;

    // --- Per-schedule last settlement (audit M1: gates settleScheduledRun to one run per period,
    //     killing the settle -> lockFor -> settle loop a compromised keeper could use to drain). ---
    mapping(uint256 => uint64) public lastSettledAt;
    uint64 public constant MIN_SETTLE_INTERVAL = 27 days;

    event UsdcToCkesSwap(address indexed payer, address indexed recipient, uint256 usdcIn, uint256 usdmSpent, uint256 ckesOut, uint256 feeUsdc);
    event RunLocked(address indexed owner, uint256 indexed scheduleId, uint256 usdcAmount, address indexed fundedBy);
    event RunSettled(address indexed owner, uint256 indexed scheduleId, address recipient, uint256 usdcIn, uint256 ckesOut);
    event RunRefunded(address indexed owner, uint256 indexed scheduleId, uint256 usdcAmount);
    event FeeUpdated(address indexed feeRecipient, uint16 feeBps);
    event KeeperUpdated(address indexed keeper);

    error ZeroAmount();
    error AlreadyLocked();
    error NothingLocked();
    error NotUsdcPlan();

    uint256 private _entered;
    modifier nonReentrant() { require(_entered == 0, "reentrant"); _entered = 1; _; _entered = 0; }
    modifier onlyAdmin() { require(msg.sender == admin, "not admin"); _; }
    // audit M1: keeper is STRICT (no `|| admin`) so a compromised admin alone cannot settle/lock —
    // settlement requires the dedicated keeper key. Admin still rotates the keeper via setKeeper.
    modifier onlyKeeper() { require(msg.sender == keeper, "not keeper"); _; }

    constructor(
        address brokerAddress, address exchangeProviderAddress, bytes32 usdcToUsdmExchangeId,
        address routerAddress, address poolAddress, uint24 poolFeeValue,
        address usdcAddress, address usdmAddress, address ckesAddress,
        address ledgerAddress, address feeRecipientAddress, uint16 initialFeeBps
    ) {
        require(initialFeeBps <= 1000, "fee > 10%");
        broker = IMentoBroker(brokerAddress); exchangeProvider = exchangeProviderAddress; usdcToUsdmId = usdcToUsdmExchangeId;
        router = ISwapRouter02(routerAddress); pool = IUniswapV3Pool(poolAddress); poolFee = poolFeeValue;
        usdc = IERC20(usdcAddress); usdm = IERC20(usdmAddress); ckes = IERC20(ckesAddress);
        ledger = IChocoLedger(ledgerAddress);
        admin = msg.sender; keeper = msg.sender; feeRecipient = feeRecipientAddress; feeBps = initialFeeBps;
        emit KeeperUpdated(msg.sender);
    }

    // --- Admin ---------------------------------------------------------------
    function setFee(address newRecipient, uint16 newFeeBps) external onlyAdmin {
        require(newFeeBps <= 1000, "fee > 10%");
        feeRecipient = newRecipient; feeBps = newFeeBps; emit FeeUpdated(newRecipient, newFeeBps);
    }
    function setKeeper(address newKeeper) external onlyAdmin {
        require(newKeeper != address(0), "bad keeper");
        require(newKeeper != admin, "keeper==admin"); // audit M1: keep the roles separated
        keeper = newKeeper; emit KeeperUpdated(newKeeper);
    }
    function transferAdmin(address newAdmin) external onlyAdmin {
        require(newAdmin != address(0), "bad admin"); admin = newAdmin;
    }

    // --- Quotes (slot0 estimate for the frontend) ----------------------------
    function quote(uint256 usdcAmountIn) external view returns (uint256 ckesAmountOut) {
        if (usdcAmountIn == 0) return 0;
        uint256 feeUsdc = feeBps > 0 ? (usdcAmountIn * feeBps) / 10_000 : 0;
        return _quoteForward(usdcAmountIn - feeUsdc);
    }

    function quoteExactOut(uint256 ckesExactOut) external view returns (uint256 usdcAmountIn) {
        if (ckesExactOut == 0) return 0;
        uint256 sampleUsdc = 1_000_000;
        uint256 sampleCkes = _quoteForward(sampleUsdc);
        if (sampleCkes == 0) return type(uint256).max;
        uint256 netUsdc = ((ckesExactOut * sampleUsdc * 101) / (sampleCkes * 100)) + 1;
        usdcAmountIn = feeBps == 0 ? netUsdc : ((netUsdc * 10_000) / (10_000 - feeBps)) + 1;
    }

    // --- Send now ------------------------------------------------------------

    /// @notice Fixed-input send: recipient receives all KESm produced from `usdcAmountIn`.
    function swapAndSend(address recipient, uint256 usdcAmountIn, uint256 ckesMinOut)
        external nonReentrant returns (uint256 ckesAmountOut)
    {
        if (usdcAmountIn == 0) revert ZeroAmount();
        require(ckesMinOut > 0, "no min out"); // audit M4: forbid a 0 floor (sandwich -> ~0 KESm delivered)
        require(recipient != address(0), "bad recipient");
        require(usdc.transferFrom(msg.sender, address(this), usdcAmountIn), "usdc pull");

        (uint256 fee, uint256 swapUsdc) = _collectFee(usdcAmountIn);
        require(usdc.approve(address(broker), swapUsdc), "usdc approve");
        uint256 usdmQ = broker.getAmountOut(exchangeProvider, usdcToUsdmId, address(usdc), address(usdm), swapUsdc);
        uint256 usdmReceived = broker.swapIn(exchangeProvider, usdcToUsdmId, address(usdc), address(usdm), swapUsdc, (usdmQ * 985) / 1000);

        require(usdm.approve(address(router), usdmReceived), "usdm approve");
        ckesAmountOut = router.exactInputSingle(ISwapRouter02.ExactInputSingleParams({
            tokenIn: address(usdm), tokenOut: address(ckes), fee: poolFee, recipient: recipient,
            amountIn: usdmReceived, amountOutMinimum: ckesMinOut, sqrtPriceLimitX96: 0
        }));
        emit UsdcToCkesSwap(msg.sender, recipient, usdcAmountIn, usdmReceived, ckesAmountOut, fee);
        _log(msg.sender, recipient, usdcAmountIn, ckesAmountOut, "send-now-v2");
    }

    /// @notice Exact-output send: recipient receives EXACTLY `ckesExactOut`; surplus returned to sender.
    function swapAndSendExact(address recipient, uint256 usdcAmountIn, uint256 ckesExactOut)
        external nonReentrant returns (uint256 ckesAmountOut)
    {
        if (usdcAmountIn == 0 || ckesExactOut == 0) revert ZeroAmount();
        require(recipient != address(0), "bad recipient");
        require(usdc.transferFrom(msg.sender, address(this), usdcAmountIn), "usdc pull");

        (uint256 fee, uint256 netUsdc, uint256 usdmSpent) = _swapExactOut(usdcAmountIn, recipient, ckesExactOut, msg.sender);
        ckesAmountOut = ckesExactOut;
        emit UsdcToCkesSwap(msg.sender, recipient, netUsdc, usdmSpent, ckesAmountOut, fee);
        _log(msg.sender, recipient, netUsdc, ckesAmountOut, "send-now-exact-v2");
    }

    // --- Held funds (one run at a time) --------------------------------------

    /// @notice Owner reserves the next run's USDC for their plan; it leaves the wallet so it can't be spent.
    function fundRun(uint256 scheduleId, uint256 usdcAmount) external nonReentrant {
        if (usdcAmount == 0) revert ZeroAmount();
        if (lockedOf[msg.sender][scheduleId] != 0) revert AlreadyLocked();
        // audit: tie the lock to a real, active schedule the caller owns (no orphaned locks) and cap it
        // at the schedule's funded amount (no over-lock).
        IChocoLedger.Schedule memory s = ledger.getSchedule(scheduleId);
        require(s.owner == msg.sender && s.active && !s.cancelled, "bad schedule");
        require(usdcAmount <= s.sourceAmount, "over-lock");
        require(usdc.transferFrom(msg.sender, address(this), usdcAmount), "usdc pull");
        lockedOf[msg.sender][scheduleId] = usdcAmount;
        emit RunLocked(msg.sender, scheduleId, usdcAmount, msg.sender);
    }

    /// @notice Keeper reserves the next run from the owner's standing allowance (auto-lock after a run).
    function lockFor(address owner, uint256 scheduleId, uint256 usdcAmount) external onlyKeeper nonReentrant {
        if (usdcAmount == 0) revert ZeroAmount();
        if (lockedOf[owner][scheduleId] != 0) revert AlreadyLocked();
        // audit M1: bound the keeper-initiated lock to the schedule's own funded amount so a compromised
        // keeper can't over-pull an owner's standing USDC allowance.
        IChocoLedger.Schedule memory s = ledger.getSchedule(scheduleId);
        require(s.owner == owner && s.active && !s.cancelled, "bad schedule");
        require(usdcAmount <= s.sourceAmount, "over-lock");
        require(usdc.transferFrom(owner, address(this), usdcAmount), "usdc pull");
        lockedOf[owner][scheduleId] = usdcAmount;
        emit RunLocked(owner, scheduleId, usdcAmount, msg.sender);
    }

    /// @notice Owner reclaims a reserved run (cancel/pause). Always available — funds are never trapped.
    function refundRun(uint256 scheduleId) external nonReentrant {
        uint256 amount = lockedOf[msg.sender][scheduleId];
        if (amount == 0) revert NothingLocked();
        lockedOf[msg.sender][scheduleId] = 0;
        require(usdc.transfer(msg.sender, amount), "usdc refund");
        emit RunRefunded(msg.sender, scheduleId, amount);
    }

    // --- Scheduled settlement (ledger-verified — keeper cannot redirect) ------

    /// @notice Keeper settles a held run. Recipient + KESm amount come from the ChocoLedger schedule,
    ///         not from the caller, so a compromised keeper can only trigger the owner's own plan.
    function settleScheduledRun(uint256 scheduleId) external onlyKeeper nonReentrant returns (uint256 ckesAmountOut) {
        IChocoLedger.Schedule memory s = ledger.getSchedule(scheduleId);
        require(s.active && !s.cancelled, "inactive");
        if (s.sourceAsset != address(usdc)) revert NotUsdcPlan();
        // audit M1: at most one settlement per period — blocks the settle -> lockFor -> settle drain loop.
        require(block.timestamp >= lastSettledAt[scheduleId] + MIN_SETTLE_INTERVAL, "too soon");

        uint256 held = lockedOf[s.owner][scheduleId];
        if (held == 0) revert NothingLocked();
        lockedOf[s.owner][scheduleId] = 0;          // effects before interactions; held USDC already here
        lastSettledAt[scheduleId] = uint64(block.timestamp);

        (uint256 fee, uint256 netUsdc, ) = _swapExactOut(held, s.recipient, s.destinationAmount, s.owner);
        ckesAmountOut = s.destinationAmount;
        emit UsdcToCkesSwap(s.owner, s.recipient, netUsdc, 0, ckesAmountOut, fee);
        emit RunSettled(s.owner, scheduleId, s.recipient, netUsdc, ckesAmountOut);
        _log(s.owner, s.recipient, netUsdc, ckesAmountOut, "schedule-exact-v2");
    }

    // --- Internal ------------------------------------------------------------

    /// @dev Two-hop exact-output: USDC -> USDm (Mento) -> exactly `ckesExactOut` KESm (UniV3) to
    ///      `recipient`. Surplus is returned to `refundTo` as USDm directly — a single transfer that
    ///      can't fail, so the recipient delivery is never blocked by a Mento refund hiccup. Assumes
    ///      `usdcAmountIn` is already held by this contract.
    function _swapExactOut(uint256 usdcAmountIn, address recipient, uint256 ckesExactOut, address refundTo)
        internal returns (uint256 fee, uint256 netUsdc, uint256 usdmSpent)
    {
        require(recipient != address(0), "bad recipient");
        uint256 swapUsdc;
        (fee, swapUsdc) = _collectFee(usdcAmountIn);

        require(usdc.approve(address(broker), swapUsdc), "usdc approve");
        uint256 usdmQ = broker.getAmountOut(exchangeProvider, usdcToUsdmId, address(usdc), address(usdm), swapUsdc);
        uint256 usdmReceived = broker.swapIn(exchangeProvider, usdcToUsdmId, address(usdc), address(usdm), swapUsdc, (usdmQ * 985) / 1000);

        require(usdm.approve(address(router), usdmReceived), "usdm approve");
        usdmSpent = router.exactOutputSingle(ISwapRouter02.ExactOutputSingleParams({
            tokenIn: address(usdm), tokenOut: address(ckes), fee: poolFee, recipient: recipient,
            amountOut: ckesExactOut, amountInMaximum: usdmReceived, sqrtPriceLimitX96: 0
        }));
        require(usdm.approve(address(router), 0), "usdm reset");

        uint256 usdmLeft = usdmReceived - usdmSpent;
        if (usdmLeft > 0) require(usdm.transfer(refundTo, usdmLeft), "usdm refund");

        // USDm ~ USDC 1:1; report the net USDC-equivalent cost (gross minus the refunded USDm).
        uint256 refundUsdcEq = usdmLeft / 1e12;
        netUsdc = usdcAmountIn > refundUsdcEq ? usdcAmountIn - refundUsdcEq : usdcAmountIn;
    }

    function _collectFee(uint256 usdcAmountIn) internal returns (uint256 fee, uint256 swapUsdc) {
        fee = feeBps > 0 && feeRecipient != address(0) ? (usdcAmountIn * feeBps) / 10_000 : 0;
        swapUsdc = usdcAmountIn - fee;
        if (fee > 0) require(usdc.transfer(feeRecipient, fee), "fee transfer");
    }

    function _quoteForward(uint256 swapUsdc) internal view returns (uint256) {
        if (swapUsdc == 0) return 0;
        uint256 usdmOut = broker.getAmountOut(exchangeProvider, usdcToUsdmId, address(usdc), address(usdm), swapUsdc);
        if (usdmOut == 0) return 0;
        (uint160 sqrtPriceX96,,,,,,) = pool.slot0();
        uint256 scaledInvSqrt = (2**96 * 1_000_000_000) / uint256(sqrtPriceX96);
        uint256 ckesPerUsdm18 = scaledInvSqrt * scaledInvSqrt;
        return (usdmOut * ckesPerUsdm18) / 1_000_000_000_000_000_000;
    }

    function _log(address payer, address recipient, uint256 usdcIn, uint256 ckesOut, string memory note) internal {
        if (address(ledger) != address(0)) {
            try ledger.logAttemptFor(payer, 0, recipient, usdcIn, ckesOut, note) {} catch {}
        }
    }
}
