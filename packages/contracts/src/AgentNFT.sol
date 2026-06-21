// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @notice ERC-7857 intelligent-data commitment: a description + a bytes32 hash.
/// In iWORLD, `dataHash` is the agent's personality version (keccak over the
/// canonical, encrypted-on-0G personality), exactly as @kipr/core computes it.
struct IntelligentData {
    string dataDescription;
    bytes32 dataHash;
}

/// @title AgentNFT — iWORLD agent ownership token (ERC-7857-shaped, v1).
/// @notice An agent = a token you own. Its private brain (personality + memory)
/// lives ENCRYPTED on 0G; this token commits to the agent's dataHash(es) and the
/// 0G storage rootHash on-chain, so ownership + identity are provable and
/// portable. Standard ERC-721 transfer moves the token; the deeper ERC-7857
/// re-keyed transfer (re-encrypting the brain to a buyer via a TEE oracle) is the
/// next step and reuses the canonical 0g-agent-nft verifier stack.
contract AgentNFT is ERC721, Ownable {
    uint256 private _nextId = 1;

    mapping(uint256 => IntelligentData[]) private _data;
    /// @notice 0G Storage rootHash of the agent's encrypted brain, per token.
    mapping(uint256 => string) public brainRootHash;
    /// @notice Optional mint fee (wei of 0G).
    uint256 public mintFee;

    event AgentMinted(uint256 indexed tokenId, address indexed to, bytes32 dataHash, string rootHash);
    event AgentUpdated(uint256 indexed tokenId, bytes32 dataHash, string rootHash);

    constructor(address initialOwner) ERC721("iWORLD Agent", "AGENT") Ownable(initialOwner) {}

    function setMintFee(uint256 fee) external onlyOwner {
        mintFee = fee;
    }

    /// @notice Mint an agent token committing to its dataHash(es) + 0G brain rootHash.
    /// @param iDatas the ERC-7857 intelligent-data commitments (datas[0] is primary).
    /// @param rootHash the 0G Storage rootHash of the encrypted personality blob.
    /// @param to the owner of the new agent.
    function mint(IntelligentData[] calldata iDatas, string calldata rootHash, address to)
        external
        payable
        returns (uint256 tokenId)
    {
        require(to != address(0), "zero address");
        require(iDatas.length > 0, "empty data");
        require(msg.value >= mintFee, "insufficient fee");

        tokenId = _nextId++;
        _safeMint(to, tokenId);
        _setData(tokenId, iDatas);
        brainRootHash[tokenId] = rootHash;

        if (msg.value > mintFee) {
            payable(msg.sender).transfer(msg.value - mintFee);
        }
        emit AgentMinted(tokenId, to, iDatas[0].dataHash, rootHash);
    }

    /// @notice Update the committed data after an opt-in personality version change.
    /// @dev Only the token owner — the agent is theirs to evolve. "No silent swap"
    /// holds: a new version is a new dataHash the owner deliberately commits.
    function update(uint256 tokenId, IntelligentData[] calldata newDatas, string calldata rootHash) external {
        require(ownerOf(tokenId) == msg.sender, "not owner");
        require(newDatas.length > 0, "empty data");
        _setData(tokenId, newDatas);
        brainRootHash[tokenId] = rootHash;
        emit AgentUpdated(tokenId, newDatas[0].dataHash, rootHash);
    }

    /// @notice All committed intelligent-data for a token.
    function dataOf(uint256 tokenId) external view returns (IntelligentData[] memory) {
        return _data[tokenId];
    }

    /// @notice The primary (datas[0]) committed dataHash for a token.
    function primaryDataHash(uint256 tokenId) external view returns (bytes32) {
        require(_data[tokenId].length > 0, "no data");
        return _data[tokenId][0].dataHash;
    }

    /// @notice Total agents minted.
    function totalMinted() external view returns (uint256) {
        return _nextId - 1;
    }

    function withdraw(address payable to) external onlyOwner {
        to.transfer(address(this).balance);
    }

    function _setData(uint256 tokenId, IntelligentData[] calldata datas) internal {
        delete _data[tokenId];
        for (uint256 i = 0; i < datas.length; i++) {
            _data[tokenId].push(datas[i]);
        }
    }
}
