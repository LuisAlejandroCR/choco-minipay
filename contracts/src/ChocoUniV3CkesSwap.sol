// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

interface IMentoBroker {
    function getAmountOut(
        address exchangeProvider,
        bytes32 exchangeId,
        address tokenIn,
        address tokenOut,
        uint256 amountIn
    ) external view returns (uint256);

    function swapIn(
        address exchangeProvider,
        bytes32 exchangeId,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOutMin
    ) external returns (uint256);
}

interface IChocoLedger {
    function logAttemptFor(
        address payer,
        uint8   kind,
        address recipientWallet,
        uint256 usdcAmount,
        uint256 ckesAmount,
        string  calldata note
    ) external returns (uint256);
}

interface IUniswapV3Pool {
    function slot0() external view returns (
        uint160 sqrtPriceX96,
        int24   tick,
        uint16  observationIndex,
        uint16  observationCardinality,
        uint16  observationCardinalityNext,
        uint8   feeProtocol,
        bool    unlocked
    );
}

interface ISwapRouter02 {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24  fee;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }
    function exactInputSingle(ExactInputSingleParams calldata params) external returns (uint256 amountOut);
}

/// @title ChocoUniV3CkesSwap
/// @notice Backup USDC -> KESm swap contract. Uses Mento for USDC->USDm (hop 1, oracle live)
/// and Uniswap V3 for USDm->KESm (hop 2, no Mento KESm oracle required). This contract is
/// a drop-in replacement for ChocoCkesSwap when the Mento USDm/KESm BiPool oracle is down.
/// The swap contract interface (quoteExactOut, swapAndSend, swapAndSendExact) is identical
/// so the frontend routes.js can call either contract through the same ABI.
contract ChocoUniV3CkesSwap {
    // --- Mento (hop 1: USDC -> USDm) -----------------------------------------
    IMentoBroker public immutable broker;
    address      public immutable exchangeProvider;
    bytes32      public immutable usdcToUsdmId;

    // --- Uniswap V3 (hop 2: USDm -> KESm) ------------------------------------
    ISwapRouter02  public immutable router;
    IUniswapV3Pool public immutable pool;    // USDm/KESm pool: token0=KESm, token1=USDm
    uint24         public immutable poolFee; // 100 = 0.01%

    // --- Tokens --------------------------------------------------------------
    IERC20 public immutable usdc;
    IERC20 public immutable usdm;
    IERC20 public immutable ckes;

    // --- Admin ---------------------------------------------------------------
    IChocoLedger public immutable ledger;       // address(0) = logging disabled
    address      public immutable feeRecipient; // address(0) = no fee collected
    uint16       public immutable feeBps;       // e.g. 25 = 0.25%; 0 = no fee

    event UsdcToCkesSwap(
        address indexed payer,
        address indexed recipient,
        uint256 usdcIn,
        uint256 usdmMid,
        uint256 ckesOut,
        uint256 ckesMinOut,
        uint256 feePaid
    );

    error SwapShort(uint256 received, uint256 minOut);
    error ZeroAmount();

    constructor(
        address brokerAddress,
        address exchangeProviderAddress,
        bytes32 usdcToUsdmExchangeId,
        address routerAddress,
        address poolAddress,
        uint24  poolFeeValue,
        address usdcAddress,
        address usdmAddress,
        address ckesAddress,
        address ledgerAddress,
        address feeRecipientAddress,
        uint16  feeBasisPoints
    ) {
        require(feeBasisPoints <= 1000, "fee > 10%");
        broker           = IMentoBroker(brokerAddress);
        exchangeProvider = exchangeProviderAddress;
        usdcToUsdmId     = usdcToUsdmExchangeId;
        router           = ISwapRouter02(routerAddress);
        pool             = IUniswapV3Pool(poolAddress);
        poolFee          = poolFeeValue;
        usdc             = IERC20(usdcAddress);
        usdm             = IERC20(usdmAddress);
        ckes             = IERC20(ckesAddress);
        ledger           = IChocoLedger(ledgerAddress);
        feeRecipient     = feeRecipientAddress;
        feeBps           = feeBasisPoints;
    }

    // --- Quotes --------------------------------------------------------------

    /// @notice Forward quote: how much KESm for a given USDC input (net of fee, two-hop).
    function quote(uint256 usdcAmountIn) external view returns (uint256 ckesAmountOut) {
        if (usdcAmountIn == 0) return 0;
        uint256 feeUsdc = feeBps > 0 ? (usdcAmountIn * feeBps) / 10_000 : 0;
        return _quoteForward(usdcAmountIn - feeUsdc);
    }

    /// @notice Same as quote() but also returns fee and net-of-fee USDC breakdown.
    function quoteWithFee(uint256 usdcAmountIn) external view returns (
        uint256 ckesAmountOut,
        uint256 feeUsdc,
        uint256 swapUsdc
    ) {
        feeUsdc       = feeBps > 0 ? (usdcAmountIn * feeBps) / 10_000 : 0;
        swapUsdc      = usdcAmountIn - feeUsdc;
        ckesAmountOut = _quoteForward(swapUsdc);
    }

    /// @notice Inverse quote: how much USDC to provide to receive at least `ckesExactOut` KESm.
    ///         Uses a scaled forward-quote approximation (slot0 price) with a 1% buffer.
    function quoteExactOut(uint256 ckesExactOut) external view returns (uint256 usdcAmountIn) {
        if (ckesExactOut == 0) return 0;
        uint256 sampleUsdc = 1_000_000; // 1 USDC (6 decimals)
        uint256 sampleCkes = _quoteForward(sampleUsdc);
        if (sampleCkes == 0) return type(uint256).max;
        // Scale: ceil(ckesExactOut / rate) with 1% buffer for slot0 approximation error
        uint256 netUsdc = ((ckesExactOut * sampleUsdc * 101) / (sampleCkes * 100)) + 1;
        usdcAmountIn = feeBps == 0 ? netUsdc : ((netUsdc * 10_000) / (10_000 - feeBps)) + 1;
    }

    // --- Swaps ---------------------------------------------------------------

    /// @notice Fixed-input swap: recipient receives all KESm produced from `usdcAmountIn`.
    function swapAndSend(
        address recipient,
        uint256 usdcAmountIn,
        uint256 ckesMinOut
    ) external returns (uint256 ckesAmountOut) {
        if (usdcAmountIn == 0) revert ZeroAmount();
        require(recipient != address(0), "bad recipient");
        require(usdc.transferFrom(msg.sender, address(this), usdcAmountIn), "usdc pull");

        (uint256 fee, uint256 swapUsdc) = _collectFee(usdcAmountIn);
        (uint256 usdmReceived, uint256 ckesOut) = _swap(swapUsdc, recipient, ckesMinOut);
        ckesAmountOut = ckesOut;

        emit UsdcToCkesSwap(msg.sender, recipient, usdcAmountIn, usdmReceived, ckesAmountOut, ckesMinOut, fee);
        _log(msg.sender, recipient, usdcAmountIn, ckesAmountOut, "send-now-v3");
    }

    /// @notice Exact-output swap: recipient receives all KESm produced; `ckesExactOut` is the
    ///         slippage floor - reverts if output is below it. The caller provides an estimated
    ///         USDC input from quoteExactOut(); any surplus cKES produced goes to the recipient.
    function swapAndSendExact(
        address recipient,
        uint256 usdcAmountIn,
        uint256 ckesExactOut
    ) external returns (uint256 ckesAmountOut) {
        if (usdcAmountIn == 0) revert ZeroAmount();
        require(recipient != address(0), "bad recipient");
        require(usdc.transferFrom(msg.sender, address(this), usdcAmountIn), "usdc pull");

        (uint256 fee, uint256 swapUsdc) = _collectFee(usdcAmountIn);
        (uint256 usdmReceived, uint256 ckesOut) = _swap(swapUsdc, recipient, ckesExactOut);
        ckesAmountOut = ckesOut;
        if (ckesAmountOut < ckesExactOut) revert SwapShort(ckesAmountOut, ckesExactOut);

        emit UsdcToCkesSwap(msg.sender, recipient, usdcAmountIn, usdmReceived, ckesAmountOut, ckesExactOut, fee);
        _log(msg.sender, recipient, usdcAmountIn, ckesAmountOut, "send-now-exact-v3");
    }

    // --- Internal helpers -----------------------------------------------------

    /// @dev Two-hop forward quote using Mento (step 1) and Uniswap V3 slot0 price (step 2).
    ///      Slot0 is an approximation - no slippage - used only for quoteExactOut estimation.
    function _quoteForward(uint256 swapUsdc) internal view returns (uint256) {
        if (swapUsdc == 0) return 0;
        uint256 usdmOut = broker.getAmountOut(exchangeProvider, usdcToUsdmId, address(usdc), address(usdm), swapUsdc);
        if (usdmOut == 0) return 0;
        return _ckesFromUsdmSlot0(usdmOut);
    }

    /// @dev Approximate KESm for a given USDm amount using the pool's current spot price.
    ///      Pool layout: token0 = KESm (18 dec), token1 = USDm (18 dec).
    ///      sqrtPriceX96 = sqrt(USDm_per_KESm) * 2^96
    ///      KESm_per_USDm_scaled = (2^96 * 1e9 / sqrtPriceX96)^2  ->  divide by 1e18 to get result.
    ///      Intermediate values stay well within uint256: scaledInvSqrt ~ 1.1e10, its square ~ 1.3e20.
    function _ckesFromUsdmSlot0(uint256 usdmIn) internal view returns (uint256) {
        (uint160 sqrtPriceX96,,,,,,) = pool.slot0();
        uint256 scaledInvSqrt = (2**96 * 1_000_000_000) / uint256(sqrtPriceX96);
        uint256 ckesPerUsdm18 = scaledInvSqrt * scaledInvSqrt;
        return (usdmIn * ckesPerUsdm18) / 1_000_000_000_000_000_000;
    }

    function _collectFee(uint256 usdcAmountIn) internal returns (uint256 fee, uint256 swapUsdc) {
        fee = feeBps > 0 && feeRecipient != address(0) ? (usdcAmountIn * feeBps) / 10_000 : 0;
        swapUsdc = usdcAmountIn - fee;
        if (fee > 0) require(usdc.transfer(feeRecipient, fee), "fee transfer");
    }

    /// @dev Hop 1: USDC -> USDm via Mento (oracle lives on a separate feed from KESm).
    ///      Hop 2: USDm -> KESm via Uniswap V3 exactInputSingle. KESm goes directly to recipient.
    function _swap(
        uint256 swapUsdc,
        address recipient,
        uint256 ckesMinOut
    ) internal returns (uint256 usdmReceived, uint256 ckesAmountOut) {
        require(usdc.approve(address(broker), swapUsdc), "usdc approve");
        uint256 usdmQuote = broker.getAmountOut(exchangeProvider, usdcToUsdmId, address(usdc), address(usdm), swapUsdc);
        usdmReceived = broker.swapIn(
            exchangeProvider, usdcToUsdmId,
            address(usdc), address(usdm),
            swapUsdc, (usdmQuote * 985) / 1000
        );

        require(usdm.approve(address(router), usdmReceived), "usdm approve");
        ckesAmountOut = router.exactInputSingle(
            ISwapRouter02.ExactInputSingleParams({
                tokenIn:           address(usdm),
                tokenOut:          address(ckes),
                fee:               poolFee,
                recipient:         recipient,
                amountIn:          usdmReceived,
                amountOutMinimum:  ckesMinOut,
                sqrtPriceLimitX96: 0
            })
        );
    }

    function _log(address payer, address recipient, uint256 usdcIn, uint256 ckesOut, string memory note) internal {
        if (address(ledger) != address(0)) {
            try ledger.logAttemptFor(payer, 0, recipient, usdcIn, ckesOut, note) {} catch {}
        }
    }
}
