// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ChocoScheduleRegistry
/// @notice Fund-less registry for recurring Choco wallet-approved remittance plans on Celo.
/// @dev The registry records schedules and receipts only. It never holds funds. Settlement is
/// executed by a wallet-approved router/keeper through connected protocols.
contract ChocoScheduleRegistry {
    struct Schedule {
        address owner;
        address recipient;
        address settlementSpender;
        address sourceAsset;
        uint256 sourceAmount;
        uint256 destinationAmount;
        uint8 dayOfMonth;     // 1-28 keeps every schedule valid in every month
        uint8 maxRetries;
        uint64 firstRunAt;
        bool active;
        bool cancelled;
        bytes32 commandHash;
    }

    address public admin;
    address public keeper;
    uint256 public scheduleCount;
    mapping(uint256 => Schedule) public schedules;

    event KeeperUpdated(address indexed keeper);
    event MonthlyScheduleCreated(
        uint256 indexed id,
        address indexed owner,
        address indexed recipient,
        address settlementSpender,
        address sourceAsset,
        uint256 sourceAmount,
        uint256 destinationAmount,
        uint8 dayOfMonth,
        uint64 firstRunAt,
        uint8 maxRetries,
        bytes32 commandHash
    );
    event ScheduleCancelled(uint256 indexed id, address indexed by);
    event SchedulePaused(uint256 indexed id, address indexed by);
    event ScheduleResumed(uint256 indexed id, address indexed by);
    event SettlementReceipt(
        uint256 indexed id,
        bool success,
        address sourceAsset,
        uint256 sourceAmount,
        uint256 destinationAmount,
        bytes32 settlementRef,
        string note
    );

    modifier onlyAdmin() {
        require(msg.sender == admin, "not admin");
        _;
    }

    modifier onlyKeeper() {
        require(msg.sender == keeper, "not keeper");
        _;
    }

    constructor(address initialKeeper) {
        admin = msg.sender;
        keeper = initialKeeper;
        emit KeeperUpdated(initialKeeper);
    }

    function setKeeper(address nextKeeper) external onlyAdmin {
        keeper = nextKeeper;
        emit KeeperUpdated(nextKeeper);
    }

    function createMonthlySchedule(
        address recipient,
        address settlementSpender,
        address sourceAsset,
        uint256 sourceAmount,
        uint256 destinationAmount,
        uint8 dayOfMonth,
        uint64 firstRunAt,
        bytes32 commandHash
    ) external returns (uint256 id) {
        require(recipient != address(0), "bad recipient");
        require(settlementSpender != address(0), "bad spender");
        require(sourceAsset != address(0), "bad asset");
        require(sourceAmount > 0, "bad source amount");
        require(destinationAmount > 0, "bad destination amount");
        require(dayOfMonth >= 1 && dayOfMonth <= 28, "bad day");

        uint64 start = firstRunAt < block.timestamp ? uint64(block.timestamp) : firstRunAt;
        id = ++scheduleCount;
        schedules[id] = Schedule({
            owner: msg.sender,
            recipient: recipient,
            settlementSpender: settlementSpender,
            sourceAsset: sourceAsset,
            sourceAmount: sourceAmount,
            destinationAmount: destinationAmount,
            dayOfMonth: dayOfMonth,
            maxRetries: 3,
            firstRunAt: start,
            active: true,
            cancelled: false,
            commandHash: commandHash
        });

        emit MonthlyScheduleCreated(id, msg.sender, recipient, settlementSpender, sourceAsset, sourceAmount, destinationAmount, dayOfMonth, start, 3, commandHash);
    }

    function cancelSchedule(uint256 id) external {
        Schedule storage schedule = schedules[id];
        require(schedule.owner == msg.sender || msg.sender == admin, "not owner");
        schedule.active = false;
        schedule.cancelled = true;
        emit ScheduleCancelled(id, msg.sender);
    }

    function pauseSchedule(uint256 id) external {
        Schedule storage schedule = schedules[id];
        require(schedule.owner == msg.sender || msg.sender == admin, "not owner");
        require(!schedule.cancelled, "cancelled");
        schedule.active = false;
        emit SchedulePaused(id, msg.sender);
    }

    function resumeSchedule(uint256 id) external {
        Schedule storage schedule = schedules[id];
        require(schedule.owner == msg.sender || msg.sender == admin, "not owner");
        require(!schedule.cancelled, "cancelled");
        schedule.active = true;
        emit ScheduleResumed(id, msg.sender);
    }

    function recordSettlement(
        uint256 id,
        bool success,
        address sourceAsset,
        uint256 sourceAmount,
        uint256 destinationAmount,
        bytes32 settlementRef,
        string calldata note
    ) external onlyKeeper {
        require(schedules[id].active && !schedules[id].cancelled, "inactive");
        emit SettlementReceipt(id, success, sourceAsset, sourceAmount, destinationAmount, settlementRef, note);
    }

    function getSchedule(uint256 id) external view returns (Schedule memory) {
        return schedules[id];
    }
}
