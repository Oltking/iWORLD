// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AgentMeta} from "../src/AgentMeta.sol";

contract AgentMetaTest is Test {
    AgentMeta meta;

    function setUp() public {
        meta = new AgentMeta();
    }

    function testSetAndReadCard() public {
        assertEq(meta.cardOf(3), "");
        meta.setCard(3, "0xcardroot");
        assertEq(meta.cardOf(3), "0xcardroot");
    }

    function testOverwriteCard() public {
        meta.setCard(3, "first");
        meta.setCard(3, "second");
        assertEq(meta.cardOf(3), "second");
    }
}
