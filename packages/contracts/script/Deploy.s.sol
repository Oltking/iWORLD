// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {AgentNFT} from "../src/AgentNFT.sol";

/// @notice Deploy AgentNFT to 0G Galileo. Run when a deployer wallet is funded:
///   forge script script/Deploy.s.sol --rpc-url galileo \
///     --private-key $ZG_PRIVATE_KEY --broadcast
contract Deploy is Script {
    function run() external {
        uint256 pk = vm.envUint("ZG_PRIVATE_KEY");
        address deployer = vm.addr(pk);
        vm.startBroadcast(pk);
        AgentNFT nft = new AgentNFT(deployer);
        vm.stopBroadcast();
        console.log("AgentNFT deployed at:", address(nft));
        console.log("owner/deployer:", deployer);
    }
}
