// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ChocoAuditLog
/// @notice Append-only ledger of EVERY Choco transfer attempt: success, fall-through swap failure,
/// transfer failure, insufficient funds, or user rejection. The contract intentionally does not
/// validate the underlying transaction hashes -- the audit row is the user's own attestation.
/// It holds no funds and exposes no admin keys.
contract ChocoAuditLog {
    /// Each attempt is one of: SUCCESS, FAILED_SWAP, FAILED_TRANSFER, INSUFFICIENT_FUNDS, REJECTED.
    /// Kinds are intentionally open-ended -- a uint8 is forward-compatible with new categories.
    enum AttemptKind {
        SUCCESS,
        FAILED_SWAP,
        FAILED_TRANSFER,
        INSUFFICIENT_FUNDS,
        REJECTED
    }

    struct AuditEntry {
        address senderWallet;
        AttemptKind kind;
        bytes32 receiptLabelHash;   // keccak256(lowercased receipt label) -- "" if none
        address recipientWallet;    // zero address if unresolved
        uint256 usdcAmount;         // 6 decimals
        uint256 ckesAmount;         // 18 decimals
        bytes32 swapTxHash;         // 0x00... if no swap was attempted
        bytes32 paymentTxHash;      // 0x00... if no transfer was attempted
        uint64 loggedAt;
        string note;                // short human-readable reason (truncated by caller)
    }

    uint256 public attemptCount;
    mapping(uint256 => AuditEntry) public attempts;
    mapping(address => uint256[]) private attemptsBySender;

    event AttemptLogged(
        uint256 indexed attemptId,
        address indexed senderWallet,
        AttemptKind indexed kind,
        bytes32 receiptLabelHash,
        address recipientWallet,
        uint256 usdcAmount,
        uint256 ckesAmount,
        bytes32 swapTxHash,
        bytes32 paymentTxHash,
        string note
    );

    /// @notice Append an audit entry for the caller. Anyone can log; the entry is bound to msg.sender.
    /// @dev String `note` is stored on-chain; keep it short (under ~96 bytes) for gas.
    function logAttempt(
        AttemptKind kind,
        bytes32 receiptLabelHash,
        address recipientWallet,
        uint256 usdcAmount,
        uint256 ckesAmount,
        bytes32 swapTxHash,
        bytes32 paymentTxHash,
        string calldata note
    ) external returns (uint256 attemptId) {
        attemptId = ++attemptCount;
        attempts[attemptId] = AuditEntry({
            senderWallet: msg.sender,
            kind: kind,
            receiptLabelHash: receiptLabelHash,
            recipientWallet: recipientWallet,
            usdcAmount: usdcAmount,
            ckesAmount: ckesAmount,
            swapTxHash: swapTxHash,
            paymentTxHash: paymentTxHash,
            loggedAt: uint64(block.timestamp),
            note: note
        });
        attemptsBySender[msg.sender].push(attemptId);
        emit AttemptLogged(
            attemptId,
            msg.sender,
            kind,
            receiptLabelHash,
            recipientWallet,
            usdcAmount,
            ckesAmount,
            swapTxHash,
            paymentTxHash,
            note
        );
    }

    function getAttempt(uint256 attemptId) external view returns (AuditEntry memory) {
        require(attemptId > 0 && attemptId <= attemptCount, "no attempt");
        return attempts[attemptId];
    }

    function getAttemptsBySender(address sender) external view returns (uint256[] memory) {
        return attemptsBySender[sender];
    }
}
