// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ChocoLedger
/// @notice Unified on-chain record for Choco: recurring remittance schedules plus an append-only
///         audit log for every transfer attempt. Schedule execution receipts are keeper-gated;
///         user schedule controls are wallet-signed. Audit entries are permissionless
///         (bound to msg.sender). Every financial event — send-now or a keeper-
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
        address sourceAsset;        // audit L7: settlementSpender removed (dead — gateway uses escrow)
        uint256 sourceAmount;
        uint256 destinationAmount;
        uint8   dayOfMonth;         // 1-28 valid in every month
        uint64  firstRunAt;         // audit L7: maxRetries removed (never enforced)
        bool    active;
        bool    cancelled;
        bytes32 commandHash;
        bytes32 receiptLabelHash;
    }

    // ─── State ─────────────────────────────────────────────────────────────

    address public admin;
    address public keeper;

    uint256 public scheduleCount;
    mapping(uint256 => Schedule) public schedules;

    /// @notice Per-schedule last settlement timestamp — gates recordSettlement to once per period
    ///         (audit M2: stops a keeper replaying recordSettlement to inflate the audit trail).
    mapping(uint256 => uint64) public lastSettlementAt;
    uint64 public constant MIN_SETTLE_INTERVAL = 27 days;

    uint256 public attemptCount;   // totalTransactions: send-now + settled schedules
    mapping(uint256 => AuditEntry) public attempts;
    mapping(address => uint256[]) private attemptsBySender;

    /// @notice Swap contracts authorized to call logAttemptFor on behalf of their payers.
    mapping(address => bool) public authorizedSwapContracts;

    // ─── Events ────────────────────────────────────────────────────────────

    event KeeperUpdated(address indexed keeper);
    event AdminTransferred(address indexed from, address indexed to);    // audit L8
    event SwapContractUpdated(address indexed swapContract, bool authorized); // audit L8

    event MonthlyScheduleCreated(
        uint256 indexed id,
        address indexed owner,
        address indexed recipient,
        address sourceAsset,
        uint256 sourceAmount,
        uint256 destinationAmount,
        uint8   dayOfMonth,
        uint64  firstRunAt,
        bytes32 commandHash
    );

    event ScheduleCancelled(uint256 indexed id, address indexed by);
    event SchedulePaused(uint256 indexed id, address indexed by);
    event ScheduleResumed(uint256 indexed id, address indexed by);

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
        require(nextKeeper != address(0), "bad keeper"); // audit M3: match ChocoGateway.setKeeper guard
        keeper = nextKeeper;
        emit KeeperUpdated(nextKeeper);
    }

    /// @notice Admin handoff (audit M3: the ledger previously had NO admin transfer at all, so a lost
    ///         admin key would permanently freeze setKeeper / setSwapContract / schedule controls).
    function transferAdmin(address newAdmin) external onlyAdmin {
        require(newAdmin != address(0), "bad admin");
        emit AdminTransferred(admin, newAdmin); // audit L8
        admin = newAdmin;
    }

    function setSwapContract(address swapContract, bool authorized) external onlyAdmin {
        authorizedSwapContracts[swapContract] = authorized;
        emit SwapContractUpdated(swapContract, authorized); // audit L8
    }

    // ─── Schedule management ───────────────────────────────────────────────

    function createMonthlySchedule(
        address recipient,
        address sourceAsset,
        uint256 sourceAmount,
        uint256 destinationAmount,
        uint8   dayOfMonth,
        uint64  firstRunAt,
        bytes32 commandHash,
        bytes32 receiptLabelHash
    ) external returns (uint256 id) {
        return _createMonthlySchedule(
            msg.sender, recipient, sourceAsset, sourceAmount,
            destinationAmount, dayOfMonth, firstRunAt, commandHash, receiptLabelHash
        );
    }

    /// @notice Create a schedule on behalf of `owner`. Restricted to authorized gateways so a plan can
    ///         be created AND funded in a single user transaction (one signature). The gateway passes
    ///         its own caller as `owner`, so the schedule is owned by that user — never by the gateway.
    function createMonthlyScheduleFor(
        address owner,
        address recipient,
        address sourceAsset,
        uint256 sourceAmount,
        uint256 destinationAmount,
        uint8   dayOfMonth,
        uint64  firstRunAt,
        bytes32 commandHash,
        bytes32 receiptLabelHash
    ) external returns (uint256 id) {
        require(authorizedSwapContracts[msg.sender], "not authorized");
        require(owner != address(0), "bad owner");
        return _createMonthlySchedule(
            owner, recipient, sourceAsset, sourceAmount,
            destinationAmount, dayOfMonth, firstRunAt, commandHash, receiptLabelHash
        );
    }

    function _createMonthlySchedule(
        address owner,
        address recipient,
        address sourceAsset,
        uint256 sourceAmount,
        uint256 destinationAmount,
        uint8   dayOfMonth,
        uint64  firstRunAt,
        bytes32 commandHash,
        bytes32 receiptLabelHash
    ) internal returns (uint256 id) {
        require(recipient         != address(0), "bad recipient");
        require(sourceAsset       != address(0), "bad asset");
        require(sourceAmount      > 0,           "bad source amount");
        require(destinationAmount > 0,           "bad destination amount");
        require(dayOfMonth >= 1 && dayOfMonth <= 28, "bad day");

        uint64 start = firstRunAt < uint64(block.timestamp) ? uint64(block.timestamp) : firstRunAt;
        id = ++scheduleCount;
        schedules[id] = Schedule({
            owner:             owner,
            recipient:         recipient,
            sourceAsset:       sourceAsset,
            sourceAmount:      sourceAmount,
            destinationAmount: destinationAmount,
            dayOfMonth:        dayOfMonth,
            firstRunAt:        start,
            active:            true,
            cancelled:         false,
            commandHash:       commandHash,
            receiptLabelHash:  receiptLabelHash
        });

        emit MonthlyScheduleCreated(
            id, owner, recipient, sourceAsset,
            sourceAmount, destinationAmount, dayOfMonth, start, commandHash
        );
    }

    function cancelSchedule(uint256 id) external {
        Schedule storage s = schedules[id];
        require(s.owner == msg.sender || msg.sender == admin, "not owner");
        s.active = false;
        s.cancelled = true;
        emit ScheduleCancelled(id, msg.sender);
    }

    function pauseSchedule(uint256 id) external {
        Schedule storage s = schedules[id];
        require(s.owner == msg.sender || msg.sender == admin, "not owner");
        require(!s.cancelled, "cancelled");
        s.active = false;
        emit SchedulePaused(id, msg.sender);
    }

    function resumeSchedule(uint256 id) external {
        Schedule storage s = schedules[id];
        require(s.owner == msg.sender || msg.sender == admin, "not owner");
        require(!s.cancelled, "cancelled");
        s.active = true;
        emit ScheduleResumed(id, msg.sender);
    }

    /// @notice Record a keeper-executed settlement's receipt. The gateway's logAttemptFor already
    ///         increments totalTransactions for the run, so this only emits the structured receipt.
    function recordSettlement(
        uint256 id,
        bool    success,
        address /* sourceAsset */,       // ignored: canonical asset is read from the schedule
        uint256 sourceAmount,
        uint256 /* destinationAmount */, // ignored: canonical KESm amount is read from the schedule
        bytes32 settlementRef,
        string  calldata note
    ) external onlyKeeper {
        Schedule storage s = schedules[id];
        require(s.active && !s.cancelled, "inactive");
        // audit M2: idempotency — one receipt per period, so a replayed call can't spam the trail.
        require(block.timestamp >= lastSettlementAt[id] + MIN_SETTLE_INTERVAL, "too soon");
        lastSettlementAt[id] = uint64(block.timestamp);
        // Use the schedule's CANONICAL asset/amount (a compromised keeper can no longer fabricate the
        // delivered amount). No _logAttempt: the gateway is the single attempt-count path (no double-log).
        emit SettlementReceipt(id, success, s.sourceAsset, sourceAmount, s.destinationAmount, settlementRef, note);
    }

    /// @notice Record a settlement receipt from an authorized gateway, ATOMIC with the fund movement, so the
    ///         receipt is fund-backed instead of keeper-asserted (audit M-2 v2). Same once-per-period guard
    ///         as recordSettlement; canonical asset/amount are read from the schedule.
    function recordSettlementFor(uint256 id, uint256 sourceAmount, bytes32 settlementRef, string calldata note) external {
        require(authorizedSwapContracts[msg.sender], "not authorized");
        Schedule storage s = schedules[id];
        require(s.active && !s.cancelled, "inactive");
        require(block.timestamp >= lastSettlementAt[id] + MIN_SETTLE_INTERVAL, "too soon");
        lastSettlementAt[id] = uint64(block.timestamp);
        emit SettlementReceipt(id, true, s.sourceAsset, sourceAmount, s.destinationAmount, settlementRef, note);
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

    /// @notice Called by an authorized ChocoCkesSwap contract to record a swap on behalf of the
    ///         actual payer. This is what makes all send-now transactions visible on ChocoLedger
    ///         without requiring a separate user-signed tx.
    function logAttemptFor(
        address     payer,
        AttemptKind kind,
        address     recipientWallet,
        uint256     usdcAmount,
        uint256     ckesAmount,
        string      calldata note
    ) external returns (uint256 attemptId) {
        require(authorizedSwapContracts[msg.sender], "not authorized");
        return _logAttempt(
            payer, kind, bytes32(0), recipientWallet,
            usdcAmount, ckesAmount, bytes32(0), bytes32(0), note
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
