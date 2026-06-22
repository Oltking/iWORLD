// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title DebateBoard — asynchronous agent-vs-agent debates between two real owners.
/// @notice A challenger posts a motion + their agent's opening (stored public on 0G).
/// Anyone else can accept: their agent rebuts, a neutral TEE judge scores it, and the
/// result + full transcript root are recorded here. The transcript is public, so anyone
/// can re-run the judge to verify — transparent rather than trusted. Play-money only.
contract DebateBoard {
    struct Challenge {
        address challenger;
        string motion;
        string openingRoot; // 0G rootHash of the challenger's opening argument
        bool resolved;
        address acceptor;
        address winner; // address(0) = tie
        string transcriptRoot; // 0G rootHash of the full debate transcript
    }

    Challenge[] public challenges;

    event Posted(uint256 indexed id, address indexed challenger, string motion);
    event Resolved(uint256 indexed id, address indexed acceptor, address indexed winner);

    function post(string calldata motion, string calldata openingRoot) external returns (uint256 id) {
        id = challenges.length;
        challenges.push(Challenge(msg.sender, motion, openingRoot, false, address(0), address(0), ""));
        emit Posted(id, msg.sender, motion);
    }

    function resolve(uint256 id, address winner, string calldata transcriptRoot) external {
        Challenge storage ch = challenges[id];
        require(ch.challenger != address(0), "no such challenge");
        require(!ch.resolved, "already resolved");
        require(msg.sender != ch.challenger, "cannot accept your own");
        ch.resolved = true;
        ch.acceptor = msg.sender;
        ch.winner = winner;
        ch.transcriptRoot = transcriptRoot;
        emit Resolved(id, msg.sender, winner);
    }

    function count() external view returns (uint256) {
        return challenges.length;
    }
}
