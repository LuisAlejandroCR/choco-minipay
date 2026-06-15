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

/// @title ChocoCkesSwap
/// @notice One-shot USDC -> cKES swap wrapper around the Mento Broker. The caller approves USDC
/// to this contract, calls swap(), and receives cKES. The wrapper holds no funds between calls.
/// Two oracle-priced hops are required on Celo Mainnet: USDC -> USDm -> cKES (no direct pool).
contract ChocoCkesSwap {
    IMentoBroker public immutable broker;
    address public immutable exchangeProvider;
    bytes32 public immutable usdcToUsdmId;
    bytes32 public immutable usdmToCkesId;
    IERC20 public immutable usdc;
    IERC20 public immutable usdm;
    IERC20 public immutable ckes;

    event UsdcToCkesSwap(
        address indexed payer,
        uint256 usdcIn,
        uint256 usdmMid,
        uint256 ckesOut,
        uint256 ckesMinOut
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
        address ckesAddress
    ) {
        broker = IMentoBroker(brokerAddress);
        exchangeProvider = exchangeProviderAddress;
        usdcToUsdmId = usdcToUsdmExchangeId;
        usdmToCkesId = usdmToCkesExchangeId;
        usdc = IERC20(usdcAddress);
        usdm = IERC20(usdmAddress);
        ckes = IERC20(ckesAddress);
    }

    /// @notice Quote the cKES output for a USDC input (combined two-hop quote).
    function quote(uint256 usdcAmountIn) external view returns (uint256 ckesAmountOut) {
        if (usdcAmountIn == 0) return 0;
        uint256 usdmOut = broker.getAmountOut(exchangeProvider, usdcToUsdmId, address(usdc), address(usdm), usdcAmountIn);
        return broker.getAmountOut(exchangeProvider, usdmToCkesId, address(usdm), address(ckes), usdmOut);
    }

    /// @notice Pull `usdcAmountIn` from the caller (transferFrom), run two Mento hops, and send the
    /// resulting cKES to the caller. Reverts if the final cKES received is below `ckesMinOut`.
    function swap(uint256 usdcAmountIn, uint256 ckesMinOut) external returns (uint256 ckesAmountOut) {
        if (usdcAmountIn == 0) revert ZeroAmount();
        require(usdc.transferFrom(msg.sender, address(this), usdcAmountIn), "usdc pull");

        require(usdc.approve(address(broker), usdcAmountIn), "usdc approve");
        uint256 usdmQuote = broker.getAmountOut(exchangeProvider, usdcToUsdmId, address(usdc), address(usdm), usdcAmountIn);
        uint256 usdmReceived = broker.swapIn(
            exchangeProvider,
            usdcToUsdmId,
            address(usdc),
            address(usdm),
            usdcAmountIn,
            (usdmQuote * 985) / 1000
        );

        require(usdm.approve(address(broker), usdmReceived), "usdm approve");
        uint256 ckesQuote = broker.getAmountOut(exchangeProvider, usdmToCkesId, address(usdm), address(ckes), usdmReceived);
        ckesAmountOut = broker.swapIn(
            exchangeProvider,
            usdmToCkesId,
            address(usdm),
            address(ckes),
            usdmReceived,
            (ckesQuote * 985) / 1000
        );

        if (ckesAmountOut < ckesMinOut) revert SwapShort(ckesAmountOut, ckesMinOut);

        require(ckes.transfer(msg.sender, ckesAmountOut), "ckes deliver");
        emit UsdcToCkesSwap(msg.sender, usdcAmountIn, usdmReceived, ckesAmountOut, ckesMinOut);
    }
    /// @notice Swap USDC to cKES via two Mento hops and send the result directly to `recipient`.
    /// Reduces user confirmations from 5 to 2: one approve + this call.
    function swapAndSend(
        address recipient,
        uint256 usdcAmountIn,
        uint256 ckesMinOut
    ) external returns (uint256 ckesAmountOut) {
        if (usdcAmountIn == 0) revert ZeroAmount();
        require(recipient != address(0), "bad recipient");
        require(usdc.transferFrom(msg.sender, address(this), usdcAmountIn), "usdc pull");

        require(usdc.approve(address(broker), usdcAmountIn), "usdc approve");
        uint256 usdmQuote = broker.getAmountOut(exchangeProvider, usdcToUsdmId, address(usdc), address(usdm), usdcAmountIn);
        uint256 usdmReceived = broker.swapIn(
            exchangeProvider, usdcToUsdmId,
            address(usdc), address(usdm),
            usdcAmountIn, (usdmQuote * 985) / 1000
        );

        require(usdm.approve(address(broker), usdmReceived), "usdm approve");
        uint256 ckesQuote = broker.getAmountOut(exchangeProvider, usdmToCkesId, address(usdm), address(ckes), usdmReceived);
        ckesAmountOut = broker.swapIn(
            exchangeProvider, usdmToCkesId,
            address(usdm), address(ckes),
            usdmReceived, (ckesQuote * 985) / 1000
        );

        if (ckesAmountOut < ckesMinOut) revert SwapShort(ckesAmountOut, ckesMinOut);
        require(ckes.transfer(recipient, ckesAmountOut), "ckes deliver");
        emit UsdcToCkesSwap(msg.sender, usdcAmountIn, usdmReceived, ckesAmountOut, ckesMinOut);
    }
}
