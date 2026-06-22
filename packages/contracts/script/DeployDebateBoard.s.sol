// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {DebateBoard} from "../src/DebateBoard.sol";

contract DeployDebateBoard is Script {
    function run() external {
        uint256 pk = vm.envUint("ZG_PRIVATE_KEY");
        vm.startBroadcast(pk);
        DebateBoard board = new DebateBoard();
        vm.stopBroadcast();
        console.log("DebateBoard deployed at:", address(board));
    }
}
