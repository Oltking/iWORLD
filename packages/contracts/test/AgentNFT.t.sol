// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AgentNFT, IntelligentData} from "../src/AgentNFT.sol";

contract AgentNFTTest is Test {
    AgentNFT nft;
    address deployer = address(0xD1);
    address user = address(0xA11CE);
    address stranger = address(0xBAD);

    function setUp() public {
        vm.prank(deployer);
        nft = new AgentNFT(deployer);
    }

    function _data(string memory desc, bytes32 h) internal pure returns (IntelligentData[] memory d) {
        d = new IntelligentData[](1);
        d[0] = IntelligentData({dataDescription: desc, dataHash: h});
    }

    function testMintCommitsHashAndRootAndOwner() public {
        bytes32 h = keccak256("personality-v1");
        nft.mint(_data("kipr:personality:v1", h), "0xroot", user);

        assertEq(nft.ownerOf(1), user, "user owns the agent");
        assertEq(nft.primaryDataHash(1), h, "committed dataHash matches");
        assertEq(nft.brainRootHash(1), "0xroot", "brain rootHash committed");
        assertEq(nft.totalMinted(), 1);
    }

    function testOwnerCanUpdateVersionStrangerCannot() public {
        bytes32 h1 = keccak256("v1");
        nft.mint(_data("d", h1), "r1", user);

        bytes32 h2 = keccak256("v2");
        vm.prank(stranger);
        vm.expectRevert("not owner");
        nft.update(1, _data("d", h2), "r2");

        vm.prank(user);
        nft.update(1, _data("d", h2), "r2");
        assertEq(nft.primaryDataHash(1), h2, "version updated by owner");
        assertEq(nft.brainRootHash(1), "r2");
    }

    function testTransferMovesOwnership() public {
        nft.mint(_data("d", keccak256("v1")), "r1", user);
        vm.prank(user);
        nft.transferFrom(user, stranger, 1);
        assertEq(nft.ownerOf(1), stranger, "agent transferred");
    }

    function testMintFeeEnforcedAndExcessRefunded() public {
        vm.prank(deployer);
        nft.setMintFee(1 ether);

        vm.deal(user, 5 ether);
        vm.prank(user);
        vm.expectRevert("insufficient fee");
        nft.mint(_data("d", keccak256("v1")), "r", user);

        vm.prank(user);
        nft.mint{value: 2 ether}(_data("d", keccak256("v1")), "r", user);
        assertEq(user.balance, 4 ether, "excess over fee refunded");
        assertEq(address(nft).balance, 1 ether, "fee retained");
    }
}
