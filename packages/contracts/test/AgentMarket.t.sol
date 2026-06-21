// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AgentNFT, IntelligentData} from "../src/AgentNFT.sol";
import {AgentMarket} from "../src/AgentMarket.sol";

contract AgentMarketTest is Test {
    AgentNFT nft;
    AgentMarket market;
    address deployer = address(0xD1);
    address seller = address(0x5E11E2);
    address buyer = address(0xB0B);

    function setUp() public {
        vm.startPrank(deployer);
        nft = new AgentNFT(deployer);
        market = new AgentMarket(address(nft), 250, deployer); // 2.5% fee
        vm.stopPrank();

        // seller mints an agent
        IntelligentData[] memory d = new IntelligentData[](1);
        d[0] = IntelligentData({dataDescription: "kipr:personality:v1", dataHash: keccak256("v1")});
        vm.prank(seller);
        nft.mint(d, "0xroot", seller);
    }

    function _list(uint256 price) internal {
        vm.startPrank(seller);
        nft.approve(address(market), 1);
        market.list(1, price);
        vm.stopPrank();
    }

    function testListEscrowsToken() public {
        _list(1 ether);
        assertEq(nft.ownerOf(1), address(market), "token held in escrow");
        assertTrue(market.isListed(1));
    }

    function testBuyTransfersAndPaysSellerMinusFee() public {
        _list(1 ether);
        vm.deal(buyer, 5 ether);

        uint256 sellerBefore = seller.balance;
        vm.prank(buyer);
        market.buy{value: 1 ether}(1);

        assertEq(nft.ownerOf(1), buyer, "buyer now owns the agent");
        assertEq(seller.balance - sellerBefore, 0.975 ether, "seller paid price minus 2.5% fee");
        assertEq(address(market).balance, 0.025 ether, "fee retained");
        assertFalse(market.isListed(1));
    }

    function testBuyRefundsOverpayment() public {
        _list(1 ether);
        vm.deal(buyer, 5 ether);
        vm.prank(buyer);
        market.buy{value: 2 ether}(1);
        assertEq(buyer.balance, 4 ether, "overpayment refunded");
    }

    function testCancelReturnsToken() public {
        _list(1 ether);
        vm.prank(seller);
        market.cancel(1);
        assertEq(nft.ownerOf(1), seller, "token returned");
        assertFalse(market.isListed(1));
    }

    function testCannotBuyUnlisted() public {
        vm.deal(buyer, 1 ether);
        vm.prank(buyer);
        vm.expectRevert("not listed");
        market.buy{value: 1 ether}(1);
    }

    function testOnlySellerCancels() public {
        _list(1 ether);
        vm.prank(buyer);
        vm.expectRevert("not seller");
        market.cancel(1);
    }
}
