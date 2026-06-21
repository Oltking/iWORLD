// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {TransferRegistry} from "../src/TransferRegistry.sol";

contract DeployRegistry is Script {
    function run() external {
        uint256 pk = vm.envUint("ZG_PRIVATE_KEY");
        vm.startBroadcast(pk);
        TransferRegistry reg = new TransferRegistry();
        vm.stopBroadcast();
        console.log("TransferRegistry deployed at:", address(reg));
    }
}
