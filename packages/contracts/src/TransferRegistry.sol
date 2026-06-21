// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title TransferRegistry — plumbing for the re-keyed agent brain transfer.
/// @notice Two public lookups:
///   1. each user's TRANSFER PUBLIC KEY (so a seller can ECIES-encrypt a brain to them),
///   2. a HANDOFF pointer per token (the 0G rootHash of the brain sealed to the new owner).
/// The pubkey is public and the handoff blob is encrypted to the recipient, so neither
/// needs access control — security lives in the encryption, not the registry.
contract TransferRegistry {
    mapping(address => bytes) private _pubKeys;
    mapping(uint256 => string) private _handoffs;

    event PubKeySet(address indexed user);
    event Handoff(uint256 indexed tokenId, address indexed from, string sealedRootHash);

    /// @notice Publish your transfer public key (compressed secp256k1, 33 bytes).
    function setPubKey(bytes calldata pubKey) external {
        _pubKeys[msg.sender] = pubKey;
        emit PubKeySet(msg.sender);
    }

    function pubKeyOf(address user) external view returns (bytes memory) {
        return _pubKeys[user];
    }

    function hasPubKey(address user) external view returns (bool) {
        return _pubKeys[user].length > 0;
    }

    /// @notice Record where the brain sealed to a token's new owner lives on 0G.
    function setHandoff(uint256 tokenId, string calldata sealedRootHash) external {
        _handoffs[tokenId] = sealedRootHash;
        emit Handoff(tokenId, msg.sender, sealedRootHash);
    }

    function handoffOf(uint256 tokenId) external view returns (string memory) {
        return _handoffs[tokenId];
    }
}
