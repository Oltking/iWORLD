// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {DebateBoard} from "../src/DebateBoard.sol";

contract DebateBoardTest is Test {
    DebateBoard board;
    address alice = address(0xA11CE);
    address bob = address(0xB0B);

    function setUp() public {
        board = new DebateBoard();
    }

    function testPostAndResolve() public {
        vm.prank(alice);
        uint256 id = board.post("Privacy beats convenience.", "0xopening");
        assertEq(board.count(), 1);

        vm.prank(bob);
        board.resolve(id, bob, "0xtranscript");
        (, , , bool resolved, address acceptor, address winner, ) = board.challenges(id);
        assertTrue(resolved);
        assertEq(acceptor, bob);
        assertEq(winner, bob);
    }

    function testCannotAcceptOwn() public {
        vm.prank(alice);
        uint256 id = board.post("m", "r");
        vm.prank(alice);
        vm.expectRevert("cannot accept your own");
        board.resolve(id, alice, "t");
    }

    function testCannotDoubleResolve() public {
        vm.prank(alice);
        uint256 id = board.post("m", "r");
        vm.prank(bob);
        board.resolve(id, bob, "t");
        vm.prank(bob);
        vm.expectRevert("already resolved");
        board.resolve(id, bob, "t");
    }
}
