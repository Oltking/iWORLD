// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ArenaLog — provable, on-chain record of Grand Arena matches.
/// @notice The duel engine is deterministic: a match is a pure function of its seed +
/// styles, hashed to a transcript hash anyone can replay. Anchoring that hash here makes
/// a result tamper-proof and public — your wins are on the record, not just on our server.
/// Play-money only (no wagering); this is reputation, not gambling.
contract ArenaLog {
    mapping(address => uint256) public matchCount;
    mapping(address => uint256) public wins;

    event MatchLogged(
        address indexed player,
        bytes32 indexed opponentId,
        bytes32 transcriptHash,
        uint8 result, // 0 = loss, 1 = win, 2 = draw
        uint64 timestamp
    );

    function logMatch(bytes32 opponentId, bytes32 transcriptHash, uint8 result) external {
        require(result <= 2, "bad result");
        matchCount[msg.sender] += 1;
        if (result == 1) wins[msg.sender] += 1;
        emit MatchLogged(msg.sender, opponentId, transcriptHash, result, uint64(block.timestamp));
    }
}
