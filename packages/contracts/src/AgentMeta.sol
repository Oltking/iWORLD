// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title AgentMeta — public, cross-user listing cards for the marketplace.
/// @notice Maps a token to the 0G rootHash of a PUBLIC (unencrypted) card the seller
/// chose to reveal — name, blurb, level. The agent's private brain stays encrypted and
/// untouched; this is only the shop-window the seller opts to show. No access control:
/// it's deliberately public info, and buyers verify the token on-chain regardless.
contract AgentMeta {
    mapping(uint256 => string) private _cards;

    event Card(uint256 indexed tokenId, address indexed by, string rootHash);

    function setCard(uint256 tokenId, string calldata rootHash) external {
        _cards[tokenId] = rootHash;
        emit Card(tokenId, msg.sender, rootHash);
    }

    function cardOf(uint256 tokenId) external view returns (string memory) {
        return _cards[tokenId];
    }
}
