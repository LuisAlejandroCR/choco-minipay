// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// ─── Interfaces ────────────────────────────────────────────────────────────────

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

/// @title ChocoGateway
/// @notice Single entry-point for all Choco remittances.
///         - Deducts a protocol fee (default 0.03 %) and forwards it to feeRecipient.
///         - Executes the two-hop USDC → USDm → cKES swap through the Mento Broker.
///         - Delivers cKES directly to the recipient.
///         - Stores an on-chain record of every transaction (queryable by payer).
///         - Auto-logs each swap to ChocoLedger so the unified history shows both
///           send-now and scheduled payments from one contract address.
///         The contract holds no funds between calls.
contract ChocoGateway {

    // ─── Types ─────────────────────────────────────────────────────────────

    struct TxRecord {
        address payer;
        address recipient;
        uint256 usdcIn;      // 6 decimals — full amount the payer approved
        uint256 feeUsdc;     // 6 decimals — protocol fee deducted before swap
        uint256 ckesOut;     // 18 decimals — cKES delivered to recipient
        uint64  timestamp;
    }

    // ─── Immutables ────────────────────────────────────────────────────────

    IMentoBroker public immutable broker;
    address      public immutable exchangeProvider;
    bytes32      public immutable usdcToUsdmId;
    bytes32      public immutable usdmToCkesId;
    IERC20       public immutable usdc;
    IERC20       public immutable usdm;
    IERC20       public immutable ckes;
    IChocoLedger public immutable ledger; // address(0) = logging disabled

    // ─── Mutable state ─────────────────────────────────────────────────────

    address public admin;
    address public feeRecipient;
    uint16  public feeBps;           // basis points; 3 = 0.03 %, max 100 = 1 %

    uint256 public txCount;
    mapping(uint256 => TxRecord)    public txs;
    mapping(address => uint256[])   public txsByPayer;

    // ─── Events ────────────────────────────────────────────────────────────

    /// @dev Kept identical to ChocoCkesSwap so existing celo.js history readers work unchanged.
    event UsdcToCkesSwap(
        address indexed payer,
        uint256 usdcIn,
        uint256 usdmMid,
        uint256 ckesOut,
        uint256 ckesMinOut
    );

    /// @dev Rich event for Celoscan visibility and fee analytics.
    event SwapRecorded(
        uint256 indexed txId,
        address indexed payer,
        address indexed recipient,
        uint256 usdcIn,
        uint256 feeUsdc,
        uint256 ckesOut
    );

    event FeeUpdated(address indexed feeRecipient, uint16 feeBps);

    // ─── Errors ────────────────────────────────────────────────────────────

    error ZeroAmount();
    error SwapShort(uint256 received, uint256 minOut);

    // ─── Modifiers ─────────────────────────────────────────────────────────

    modifier onlyAdmin() { require(msg.sender == admin, "not admin"); _; }

    // ─── Constructor ───────────────────────────────────────────────────────

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
        uint16  initialFeeBps          // 3 = 0.03 %
    ) {
        require(initialFeeBps <= 100,  "fee cap 1%");
        require(feeRecipientAddress != address(0), "bad fee recipient");

        admin            = msg.sender;
        feeRecipient     = feeRecipientAddress;
        feeBps           = initialFeeBps;
        broker           = IMentoBroker(brokerAddress);
        exchangeProvider = exchangeProviderAddress;
        usdcToUsdmId     = usdcToUsdmExchangeId;
        usdmToCkesId     = usdmToCkesExchangeId;
        usdc             = IERC20(usdcAddress);
        usdm             = IERC20(usdmAddress);
        ckes             = IERC20(ckesAddress);
        ledger           = IChocoLedger(ledgerAddress);
    }

    // ─── Admin ─────────────────────────────────────────────────────────────

    function setFee(address newFeeRecipient, uint16 newFeeBps) external onlyAdmin {
        require(newFeeBps <= 100, "fee cap 1%");
        require(newFeeRecipient != address(0), "bad fee recipient");
        feeRecipient = newFeeRecipient;
        feeBps       = newFeeBps;
        emit FeeUpdated(newFeeRecipient, newFeeBps);
    }

    function transferAdmin(address newAdmin) external onlyAdmin {
        require(newAdmin != address(0), "bad admin");
        admin = newAdmin;
    }

    // ─── Quote ─────────────────────────────────────────────────────────────

    /// @notice cKES output estimate for a given USDC input, after deducting the protocol fee.
    ///         This is what the recipient actually receives.
    function quote(uint256 usdcAmountIn) external view returns (uint256 ckesAmountOut) {
        if (usdcAmountIn == 0) return 0;
        uint256 swapUsdc = usdcAmountIn - (usdcAmountIn * feeBps) / 10000;
        uint256 usdmOut  = broker.getAmountOut(exchangeProvider, usdcToUsdmId, address(usdc), address(usdm), swapUsdc);
        return   broker.getAmountOut(exchangeProvider, usdmToCkesId, address(usdm), address(ckes), usdmOut);
    }

    /// @notice Breakdown: cKES out, fee in USDC, and the net USDC that enters the swap.
    function quoteWithFee(uint256 usdcAmountIn) external view returns (
        uint256 ckesAmountOut,
        uint256 feeUsdc,
        uint256 swapUsdc
    ) {
        if (usdcAmountIn == 0) return (0, 0, 0);
        feeUsdc  = (usdcAmountIn * feeBps) / 10000;
        swapUsdc = usdcAmountIn - feeUsdc;
        uint256 usdmOut = broker.getAmountOut(exchangeProvider, usdcToUsdmId, address(usdc), address(usdm), swapUsdc);
        ckesAmountOut   = broker.getAmountOut(exchangeProvider, usdmToCkesId, address(usdm), address(ckes), usdmOut);
    }

    // ─── Core: swap, collect fee, deliver, store, log ──────────────────────

    /// @notice Pull usdcAmountIn from msg.sender, deduct the protocol fee, swap the rest to cKES,
    ///         deliver cKES to recipient, store the record, and log to ChocoLedger — all in one tx.
    function swapAndSend(
        address recipient,
        uint256 usdcAmountIn,
        uint256 ckesMinOut
    ) external returns (uint256 ckesAmountOut) {
        if (usdcAmountIn == 0) revert ZeroAmount();
        require(recipient != address(0), "bad recipient");

        // 1. Pull full USDC from payer
        require(usdc.transferFrom(msg.sender, address(this), usdcAmountIn), "usdc pull");

        // 2. Protocol fee → feeRecipient
        uint256 feeUsdc  = (usdcAmountIn * feeBps) / 10000;
        uint256 swapUsdc = usdcAmountIn - feeUsdc;
        if (feeUsdc > 0) require(usdc.transfer(feeRecipient, feeUsdc), "fee send");

        // 3. Hop 1: USDC → USDm
        require(usdc.approve(address(broker), swapUsdc), "usdc approve");
        uint256 usdmQuote    = broker.getAmountOut(exchangeProvider, usdcToUsdmId, address(usdc), address(usdm), swapUsdc);
        uint256 usdmReceived = broker.swapIn(
            exchangeProvider, usdcToUsdmId,
            address(usdc), address(usdm),
            swapUsdc, (usdmQuote * 985) / 1000
        );

        // 4. Hop 2: USDm → cKES
        require(usdm.approve(address(broker), usdmReceived), "usdm approve");
        uint256 ckesQuote = broker.getAmountOut(exchangeProvider, usdmToCkesId, address(usdm), address(ckes), usdmReceived);
        ckesAmountOut = broker.swapIn(
            exchangeProvider, usdmToCkesId,
            address(usdm), address(ckes),
            usdmReceived, (ckesQuote * 985) / 1000
        );

        if (ckesAmountOut < ckesMinOut) revert SwapShort(ckesAmountOut, ckesMinOut);

        // 5. Deliver cKES to recipient
        require(ckes.transfer(recipient, ckesAmountOut), "ckes deliver");

        // 6. Emit backwards-compatible event (keeps celo.js history reader working)
        emit UsdcToCkesSwap(msg.sender, usdcAmountIn, usdmReceived, ckesAmountOut, ckesMinOut);

        // 7. Store on-chain record
        uint256 txId = ++txCount;
        txs[txId] = TxRecord({
            payer:     msg.sender,
            recipient: recipient,
            usdcIn:    usdcAmountIn,
            feeUsdc:   feeUsdc,
            ckesOut:   ckesAmountOut,
            timestamp: uint64(block.timestamp)
        });
        txsByPayer[msg.sender].push(txId);
        emit SwapRecorded(txId, msg.sender, recipient, usdcAmountIn, feeUsdc, ckesAmountOut);

        // 8. Log to ChocoLedger — never blocks the send on failure
        if (address(ledger) != address(0)) {
            try ledger.logAttemptFor(msg.sender, 0, recipient, usdcAmountIn, ckesAmountOut, "send-now") {} catch {}
        }
    }

    // ─── Views ─────────────────────────────────────────────────────────────

    function getTx(uint256 txId) external view returns (TxRecord memory) {
        require(txId > 0 && txId <= txCount, "no tx");
        return txs[txId];
    }

    function getTxsByPayer(address payer) external view returns (uint256[] memory) {
        return txsByPayer[payer];
    }

    function totalFeeEarned() external view returns (uint256 total) {
        for (uint256 i = 1; i <= txCount; i++) {
            total += txs[i].feeUsdc;
        }
    }
}
