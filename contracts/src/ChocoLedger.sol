// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ChocoLedger
/// @notice Unified on-chain record for Choco: recurring remittance schedules plus an append-only
///         audit log for every transfer attempt. Schedule management is keeper-gated; audit entries
///         are permissionless (bound to msg.sender). Every financial event — send-now or a keeper-
///         settled scheduled payment — increments totalTransactions for a complete on-chain audit.
///         The contract holds no funds and exposes no upgrade path.
contract ChocoLedger {

    // ─── Audit types ───────────────────────────────────────────────────────

    enum AttemptKind { SUCCESS, FAILED_SWAP, FAILED_TRANSFER, INSUFFICIENT_FUNDS, REJECTED }

    struct AuditEntry {
        address     senderWallet;
        AttemptKind kind;
        bytes32     receiptLabelHash;   // keccak256(lowercased label) or 0x00 if none
        address     recipientWallet;
        uint256     usdcAmount;         // 6 decimals
        uint256     ckesAmount;         // 18 decimals
        bytes32     swapTxHash;         // 0x00 if no swap was attempted
        bytes32     paymentTxHash;      // 0x00 if no transfer was attempted
        uint64      loggedAt;
        string      note;
    }

    // ─── Schedule types ────────────────────────────────────────────────────

    struct Schedule {
        address owner;
        address recipient;
        address settlementSpender;
        address sourceAsset;
        uint256 sourceAmount;
        uint256 destinationAmount;
        uint8   dayOfMonth;       // 1-28 valid in every month
        uint8   maxRetries;
        uint64  firstRunAt;
        bool    active;
        bytes32 commandHash;
        bytes32 receiptLabelHash; // stored at creation so recordSettlement can auto-log it
    }

    // ─── State ─────────────────────────────────────────────────────────────

    address public admin;
    address public keeper;

    uint256 public scheduleCount;
    mapping(uint256 => Schedule) public schedules;

    uint256 public attemptCount;   // totalTransactions: send-now + settled schedules
    mapping(uint256 => AuditEntry) public attempts;
    mapping(address => uint256[]) private attemptsBySender;

    // ─── Events ────────────────────────────────────────────────────────────

    event KeeperUpdated(address indexed keeper);

    event MonthlyScheduleCreated(
        uint256 indexed id,
        address indexed owner,
        address indexed recipient,
        address settlementSpender,
        address sourceAsset,
        uint256 sourceAmount,
        uint256 destinationAmount,
        uint8   dayOfMonth,
        uint64  firstRunAt,
        uint8   maxRetries,
        bytes32 commandHash
    );

    event ScheduleCancelled(uint256 indexed id, address indexed by);

    event SettlementReceipt(
        uint256 indexed id,
        bool    success,
        address sourceAsset,
        uint256 sourceAmount,
        uint256 destinationAmount,
        bytes32 settlementRef,
        string  note
    );

    event AttemptLogged(
        uint256 indexed     attemptId,
        address indexed     senderWallet,
        AttemptKind indexed kind,
        bytes32  receiptLabelHash,
        address  recipientWallet,
        uint256  usdcAmount,
        uint256  ckesAmount,
        bytes32  swapTxHash,
        bytes32  paymentTxHash,
        string   note
    );

    // ─── Modifiers ─────────────────────────────────────────────────────────

    modifier onlyAdmin()  { require(msg.sender == admin,  "not admin");  _; }
    modifier onlyKeeper() { require(msg.sender == keeper, "not keeper"); _; }

    // ─── Constructor ───────────────────────────────────────────────────────

    constructor(address initialKeeper) {
        admin  = msg.sender;
        keeper = initialKeeper;
        emit KeeperUpdated(initialKeeper);
    }

    // ─── Admin ─────────────────────────────────────────────────────────────

    function setKeeper(address nextKeeper) external onlyAdmin {
        keeper = nextKeeper;
        emit KeeperUpdated(nextKeeper);
    }

    // ─── Schedule management ───────────────────────────────────────────────

    function createMonthlySchedule(
        address recipient,
        address settlementSpender,
        address sourceAsset,
        uint256 sourceAmount,
        uint256 destinationAmount,
        uint8   dayOfMonth,
        uint64  firstRunAt,
        bytes32 commandHash,
        bytes32 receiptLabelHash
    ) external returns (uint256 id) {
        require(recipient         != address(0), "bad recipient");
        require(settlementSpender != address(0), "bad spender");
        require(sourceAsset       != address(0), "bad asset");
        require(sourceAmount      > 0,           "bad source amount");
        require(destinationAmount > 0,           "bad destination amount");
        require(dayOfMonth >= 1 && dayOfMonth <= 28, "bad day");

        uint64 start = firstRunAt < uint64(block.timestamp) ? uint64(block.timestamp) : firstRunAt;
        id = ++scheduleCount;
        schedules[id] = Schedule({
            owner:             msg.sender,
            recipient:         recipient,
            settlementSpender: settlementSpender,
            sourceAsset:       sourceAsset,
            sourceAmount:      sourceAmount,
            destinationAmount: destinationAmount,
            dayOfMonth:        dayOfMonth,
            maxRetries:        3,
            firstRunAt:        start,
            active:            true,
            commandHash:       commandHash,
            receiptLabelHash:  receiptLabelHash
        });

        emit MonthlyScheduleCreated(
            id, msg.sender, recipient, settlementSpender, sourceAsset,
            sourceAmount, destinationAmount, dayOfMonth, start, 3, commandHash
        );
    }

    function cancelSchedule(uint256 id) external {
        Schedule storage s = schedules[id];
        require(s.owner == msg.sender || msg.sender == admin, "not owner");
        s.active = false;
        emit ScheduleCancelled(id, msg.sender);
    }

    /// @notice Record a keeper-executed settlement and auto-log it to the unified audit trail.
    ///         This is what makes totalTransactions include scheduled payments alongside send-now.
    function recordSettlement(
        uint256 id,
        bool    success,
        address sourceAsset,
        uint256 sourceAmount,
        uint256 destinationAmount,
        bytes32 settlementRef,
        string  calldata note
    ) external onlyKeeper {
        require(schedules[id].active, "inactive");
        emit SettlementReceipt(id, success, sourceAsset, sourceAmount, destinationAmount, settlementRef, note);
        _logAttempt(
            schedules[id].owner,
            success ? AttemptKind.SUCCESS : AttemptKind.FAILED_TRANSFER,
            schedules[id].receiptLabelHash,
            schedules[id].recipient,
            sourceAmount,
            destinationAmount,
            settlementRef,
            settlementRef,
            note
        );
    }

    function getSchedule(uint256 id) external view returns (Schedule memory) {
        return schedules[id];
    }

    // ─── Audit log ─────────────────────────────────────────────────────────

    /// @notice Append an audit entry for send-now attempts. Anyone can call; entry is bound to msg.sender.
    function logAttempt(
        AttemptKind kind,
        bytes32     receiptLabelHash,
        address     recipientWallet,
        uint256     usdcAmount,
        uint256     ckesAmount,
        bytes32     swapTxHash,
        bytes32     paymentTxHash,
        string      calldata note
    ) external returns (uint256 attemptId) {
        return _logAttempt(
            msg.sender, kind, receiptLabelHash, recipientWallet,
            usdcAmount, ckesAmount, swapTxHash, paymentTxHash, note
        );
    }

    function _logAttempt(
        address     sender,
        AttemptKind kind,
        bytes32     receiptLabelHash,
        address     recipientWallet,
        uint256     usdcAmount,
        uint256     ckesAmount,
        bytes32     swapTxHash,
        bytes32     paymentTxHash,
        string      memory note
    ) internal returns (uint256 attemptId) {
        attemptId = ++attemptCount;
        attempts[attemptId] = AuditEntry({
            senderWallet:     sender,
            kind:             kind,
            receiptLabelHash: receiptLabelHash,
            recipientWallet:  recipientWallet,
            usdcAmount:       usdcAmount,
            ckesAmount:       ckesAmount,
            swapTxHash:       swapTxHash,
            paymentTxHash:    paymentTxHash,
            loggedAt:         uint64(block.timestamp),
            note:             note
        });
        attemptsBySender[sender].push(attemptId);
        emit AttemptLogged(
            attemptId, sender, kind, receiptLabelHash, recipientWallet,
            usdcAmount, ckesAmount, swapTxHash, paymentTxHash, note
        );
    }

    // ─── Views ─────────────────────────────────────────────────────────────

    function totalTransactions() external view returns (uint256) {
        return attemptCount;
    }

    function getAttempt(uint256 attemptId) external view returns (AuditEntry memory) {
        require(attemptId > 0 && attemptId <= attemptCount, "no attempt");
        return attempts[attemptId];
    }

    function getAttemptsBySender(address sender) external view returns (uint256[] memory) {
        return attemptsBySender[sender];
    }
}
