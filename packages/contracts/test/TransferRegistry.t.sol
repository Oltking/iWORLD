// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {TransferRegistry} from "../src/TransferRegistry.sol";

contract TransferRegistryTest is Test {
    TransferRegistry reg;
    address alice = address(0xA11CE);

    function setUp() public {
        reg = new TransferRegistry();
    }

    function testSetAndReadPubKey() public {
        bytes memory pk = hex"02aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899";
        assertFalse(reg.hasPubKey(alice));
        vm.prank(alice);
        reg.setPubKey(pk);
        assertTrue(reg.hasPubKey(alice));
        assertEq(reg.pubKeyOf(alice), pk);
    }

    function testHandoffPointer() public {
        vm.prank(alice);
        reg.setHandoff(7, "0xsealedroot");
        assertEq(reg.handoffOf(7), "0xsealedroot");
    }
}
