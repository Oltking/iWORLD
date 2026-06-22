// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {AgentMeta} from "../src/AgentMeta.sol";

contract DeployMeta is Script {
    function run() external {
        uint256 pk = vm.envUint("ZG_PRIVATE_KEY");
        vm.startBroadcast(pk);
        AgentMeta meta = new AgentMeta();
        vm.stopBroadcast();
        console.log("AgentMeta deployed at:", address(meta));
    }
}
