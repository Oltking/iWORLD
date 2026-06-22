// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {ArenaLog} from "../src/ArenaLog.sol";

contract DeployArenaLog is Script {
    function run() external {
        uint256 pk = vm.envUint("ZG_PRIVATE_KEY");
        vm.startBroadcast(pk);
        ArenaLog log = new ArenaLog();
        vm.stopBroadcast();
        console.log("ArenaLog deployed at:", address(log));
    }
}
