// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ArenaLog} from "../src/ArenaLog.sol";

contract ArenaLogTest is Test {
    ArenaLog arena;
    address alice = address(0xA11CE);

    function setUp() public {
        arena = new ArenaLog();
    }

    function testLogCountsAndWins() public {
        vm.startPrank(alice);
        arena.logMatch(keccak256("Pebble"), keccak256("t1"), 1); // win
        arena.logMatch(keccak256("Nyx"), keccak256("t2"), 0); // loss
        arena.logMatch(keccak256("Nyx"), keccak256("t3"), 2); // draw
        vm.stopPrank();
        assertEq(arena.matchCount(alice), 3);
        assertEq(arena.wins(alice), 1);
    }

    function testRejectsBadResult() public {
        vm.expectRevert("bad result");
        arena.logMatch(keccak256("x"), keccak256("y"), 3);
    }
}
