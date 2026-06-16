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

/// @title ChocoCkesSwap
/// @notice One-shot USDC -> cKES swap wrapper around the Mento Broker. The caller approves USDC
/// to this contract, calls swapAndSend() or swapAndSendExact(), and the recipient receives cKES
/// directly. Two oracle-priced hops are required on Celo Mainnet: USDC -> USDm -> cKES.
/// An optional fee (feeBps basis points) is deducted from USDC before the swap and sent to
/// feeRecipient. If a ChocoLedger address is configured, every successful swap is logged there
/// automatically so all send-now transactions appear on the single ChocoLedger contract.
contract ChocoCkesSwap {
    IMentoBroker   public immutable broker;
    address        public immutable exchangeProvider;
    bytes32        public immutable usdcToUsdmId;
    bytes32        public immutable usdmToCkesId;
    IERC20         public immutable usdc;
    IERC20         public immutable usdm;
    IERC20         public immutable ckes;
    IChocoLedger   public immutable ledger;       // address(0) = logging disabled
    address        public immutable feeRecipient; // address(0) = no fee collected
    uint16         public immutable feeBps;       // e.g. 25 = 0.25%; 0 = no fee

    /// @dev Emitted on every successful swap. recipient indexed so history indexers can filter
    ///      by destination without correlating a separate cKES Transfer event.
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
        bytes32 usdmToCkesExchangeId,
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
        usdmToCkesId     = usdmToCkesExchangeId;
        usdc             = IERC20(usdcAddress);
        usdm             = IERC20(usdmAddress);
        ckes             = IERC20(ckesAddress);
        ledger           = IChocoLedger(ledgerAddress);
        feeRecipient     = feeRecipientAddress;
        feeBps           = feeBasisPoints;
    }

    // ─── Quotes ──────────────────────────────────────────────────────────────

    /// @notice Forward quote: how much cKES for a given USDC input (net of fee, two-hop).
    function quote(uint256 usdcAmountIn) external view returns (uint256 ckesAmountOut) {
        if (usdcAmountIn == 0) return 0;
        (, , uint256 swapUsdc) = _feeBreakdown(usdcAmountIn);
        return _quoteSwap(swapUsdc);
    }

    /// @notice Same as quote() but also returns fee and net-of-fee USDC breakdown.
    function quoteWithFee(uint256 usdcAmountIn) external view returns (
        uint256 ckesAmountOut,
        uint256 feeUsdc,
        uint256 swapUsdc
    ) {
        (ckesAmountOut, feeUsdc, swapUsdc) = _feeBreakdown(usdcAmountIn);
        ckesAmountOut = _quoteSwap(swapUsdc);
    }

    /// @notice Inverse quote: how much USDC to provide to receive at least `ckesExactOut` cKES.
    ///         Uses a scaled forward-quote approximation with a 1% buffer. Always round up.
    function quoteExactOut(uint256 ckesExactOut) external view returns (uint256 usdcAmountIn) {
        if (ckesExactOut == 0) return 0;
        uint256 sampleUsdc = 1_000_000; // 1 USDC (6 decimals)
        uint256 sampleCkes = _quoteSwap(sampleUsdc);
        if (sampleCkes == 0) return type(uint256).max;
        // Scale: ceil(ckesExactOut * sampleUsdc / sampleCkes), +1% buffer for precision
        uint256 netUsdc = ((ckesExactOut * sampleUsdc * 101) / (sampleCkes * 100)) + 1;
        // Gross up for fee: netUsdc = grossUsdc * (10000 - feeBps) / 10000
        usdcAmountIn = feeBps == 0 ? netUsdc : ((netUsdc * 10_000) / (10_000 - feeBps)) + 1;
    }

    // ─── Swaps ───────────────────────────────────────────────────────────────

    /// @notice Fixed-input swap: deliver all cKES received to recipient.
    ///         ckesMinOut is the slippage floor — reverts if output is below it.
    function swapAndSend(
        address recipient,
        uint256 usdcAmountIn,
        uint256 ckesMinOut
    ) external returns (uint256 ckesAmountOut) {
        if (usdcAmountIn == 0) revert ZeroAmount();
        require(recipient != address(0), "bad recipient");
        require(usdc.transferFrom(msg.sender, address(this), usdcAmountIn), "usdc pull");

        (uint256 fee, uint256 swapUsdc) = _collectFee(usdcAmountIn);

        (uint256 usdmReceived, uint256 ckesOut) = _swap(swapUsdc, ckesMinOut);
        ckesAmountOut = ckesOut;

        require(ckes.transfer(recipient, ckesAmountOut), "ckes deliver");
        emit UsdcToCkesSwap(msg.sender, recipient, usdcAmountIn, usdmReceived, ckesAmountOut, ckesMinOut, fee);
        _log(msg.sender, recipient, usdcAmountIn, ckesAmountOut, "send-now");
    }

    /// @notice Exact-output flavour: the caller provides an estimated USDC input (from
    ///         quoteExactOut) and specifies the minimum cKES to deliver. All received cKES
    ///         goes to recipient (surplus stays there, not refunded). Any surplus USDC after
    ///         fee is consumed by the swap; Mento will revert if output < ckesExactOut.
    function swapAndSendExact(
        address recipient,
        uint256 usdcAmountIn,
        uint256 ckesExactOut
    ) external returns (uint256 ckesAmountOut) {
        if (usdcAmountIn == 0) revert ZeroAmount();
        require(recipient != address(0), "bad recipient");
        require(usdc.transferFrom(msg.sender, address(this), usdcAmountIn), "usdc pull");

        (uint256 fee, uint256 swapUsdc) = _collectFee(usdcAmountIn);

        // Use ckesExactOut as the minimum — Mento will revert if it cannot deliver it.
        (uint256 usdmReceived, uint256 ckesOut) = _swap(swapUsdc, ckesExactOut);
        ckesAmountOut = ckesOut;

        require(ckes.transfer(recipient, ckesAmountOut), "ckes deliver");
        emit UsdcToCkesSwap(msg.sender, recipient, usdcAmountIn, usdmReceived, ckesAmountOut, ckesExactOut, fee);
        _log(msg.sender, recipient, usdcAmountIn, ckesAmountOut, "send-now-exact");
    }

    // ─── Internal helpers ─────────────────────────────────────────────────────

    function _feeBreakdown(uint256 usdcAmountIn) internal view returns (
        uint256 ckesOut,
        uint256 feeUsdc,
        uint256 swapUsdc
    ) {
        feeUsdc  = feeBps > 0 ? (usdcAmountIn * feeBps) / 10_000 : 0;
        swapUsdc = usdcAmountIn - feeUsdc;
        ckesOut  = 0; // populated by caller via _quoteSwap
    }

    function _collectFee(uint256 usdcAmountIn) internal returns (uint256 fee, uint256 swapUsdc) {
        fee = feeBps > 0 && feeRecipient != address(0) ? (usdcAmountIn * feeBps) / 10_000 : 0;
        swapUsdc = usdcAmountIn - fee;
        if (fee > 0) require(usdc.transfer(feeRecipient, fee), "fee transfer");
    }

    function _quoteSwap(uint256 swapUsdc) internal view returns (uint256) {
        if (swapUsdc == 0) return 0;
        uint256 usdmOut = broker.getAmountOut(exchangeProvider, usdcToUsdmId, address(usdc), address(usdm), swapUsdc);
        if (usdmOut == 0) return 0;
        return broker.getAmountOut(exchangeProvider, usdmToCkesId, address(usdm), address(ckes), usdmOut);
    }

    function _swap(uint256 swapUsdc, uint256 ckesMinOut) internal returns (uint256 usdmReceived, uint256 ckesAmountOut) {
        require(usdc.approve(address(broker), swapUsdc), "usdc approve");
        uint256 usdmQuote = broker.getAmountOut(exchangeProvider, usdcToUsdmId, address(usdc), address(usdm), swapUsdc);
        usdmReceived = broker.swapIn(
            exchangeProvider, usdcToUsdmId,
            address(usdc), address(usdm),
            swapUsdc, (usdmQuote * 985) / 1000
        );

        require(usdm.approve(address(broker), usdmReceived), "usdm approve");
        uint256 ckesQuote = broker.getAmountOut(exchangeProvider, usdmToCkesId, address(usdm), address(ckes), usdmReceived);
        ckesAmountOut = broker.swapIn(
            exchangeProvider, usdmToCkesId,
            address(usdm), address(ckes),
            usdmReceived, ckesMinOut > 0 ? ckesMinOut : (ckesQuote * 985) / 1000
        );

        if (ckesAmountOut < ckesMinOut) revert SwapShort(ckesAmountOut, ckesMinOut);
    }

    /// @dev Log to ChocoLedger so every send-now tx appears in the unified on-chain audit trail.
    ///      Wrapped in try/catch — a ledger failure never reverts the transfer that already landed.
    function _log(address payer, address recipient, uint256 usdcIn, uint256 ckesOut, string memory note) internal {
        if (address(ledger) != address(0)) {
            try ledger.logAttemptFor(payer, 0, recipient, usdcIn, ckesOut, note) {} catch {}
        }
    }
}
